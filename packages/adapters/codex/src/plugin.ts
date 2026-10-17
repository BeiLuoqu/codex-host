/**
 * Codex Harness plugin for the codexhost Adapter contract.
 *
 * The shared Host loads this plugin for Web execution through `codex app-server`
 * over stdio. Desktop's official Codex route remains native.
 */

import { execFileSync } from "node:child_process";

import { nativeCodexLaunch } from "./native-launch.ts";
import { CodexAppServer } from "./rpc.ts";
import {
  CODEX_COMMANDS,
  CodexSession,
  DEFAULT_PERMISSION_MODE,
  HARNESS_ID,
  PERMISSION_MODES,
  snapshotTurn,
} from "./session.ts";
import type { CodexItem } from "./items.ts";

export { CODEX_COMMAND_ENV, CODEX_HOME_ENV } from "./native-launch.ts";

import type {
  HarnessAdapter,
  HarnessInspection,
  HarnessResult,
  OpenSessionInput,
  InspectHarnessInput,
  HarnessSessionImportCapability,
  HostThreadSnapshot,
} from "@codexhost/harness-adapter";
import type { HarnessPluginContext } from "@codexhost/harness-adapter/plugin";
import { harnessInspectionSchema, nativeSessionRefSchema } from "@codexhost/shared-contracts";
type Result<T> = HarnessResult<T>;

const EFFORT_LABELS: Record<string, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
  ultra: "Ultra",
};

const EFFORT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];

function installed(command: string, environment: NodeJS.ProcessEnv): boolean {
  try {
    execFileSync(command, ["--version"], { env: environment, stdio: "ignore", timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

class CodexAdapter implements HarnessAdapter {
  readonly harnessId = HARNESS_ID;
  readonly commandCatalog = { commands: [...CODEX_COMMANDS], source: "static" as const };
  private control: Promise<CodexAppServer> | undefined;
  private readonly inspections = new Set<CodexAppServer>();
  private readonly inspectionInFlight = new Map<string | undefined, Promise<HarnessInspection>>();
  private closed = false;
  private readonly command: string;
  private readonly home: string;
  private readonly environment: NodeJS.ProcessEnv;

  constructor(context: HarnessPluginContext) {
    const launch = nativeCodexLaunch({ ...process.env, ...context.environment });
    this.environment = launch.environment;
    this.command = launch.command;
    this.home = launch.home;
  }

  /** A native Thread ID is meaningful only inside the home that issued it. */
  private threadId(nativeRef: unknown): Result<string> {
    const ref =
      nativeRef !== null && typeof nativeRef === "object"
        ? (nativeRef as Record<string, unknown>)
        : undefined;
    if (
      ref?.harnessId !== HARNESS_ID ||
      typeof ref.nativeSessionId !== "string" ||
      !ref.nativeSessionId.trim()
    ) {
      return {
        ok: false,
        error: {
          code: "invalidRequest",
          message: "A Codex native session reference is required",
          retryable: false,
        },
      };
    }
    const locator =
      ref.locator !== null && typeof ref.locator === "object"
        ? (ref.locator as Record<string, unknown>)
        : undefined;
    if (locator?.codexHome !== this.home) {
      return {
        ok: false,
        error: {
          code: "invalidRequest",
          message:
            "This Codex session reference is not bound to the configured Web home. Import a session from this home explicitly.",
          retryable: false,
        },
      };
    }
    return { ok: true, value: ref.nativeSessionId };
  }

  /** Shared process for read-only history and thread listing. */
  private async controlServer(): Promise<CodexAppServer> {
    if (this.closed) throw new Error("Codex Adapter is closed");
    if (this.control !== undefined) {
      const previous = this.control;
      const server = await previous.catch(() => undefined);
      if (this.closed) throw new Error("Codex Adapter is closed");
      if (server !== undefined && !server.closed) return server;
      if (this.control !== previous) return this.controlServer();
    }
    this.control = (async () => {
      const server = new CodexAppServer({
        command: this.command,
        environment: this.environment,
        sensitive: true,
        requestTimeoutMs: 15_000,
      });
      try {
        await server.initialize();
      } catch (error) {
        await server.close();
        throw error;
      }
      return server;
    })();
    return this.control;
  }

  async inspect(input: InspectHarnessInput = {}): Promise<HarnessInspection> {
    const current = this.inspectionInFlight.get(input.cwd);
    if (current) return current;
    const pending = this.inspectNative(input);
    this.inspectionInFlight.set(input.cwd, pending);
    try {
      return await pending;
    } finally {
      if (this.inspectionInFlight.get(input.cwd) === pending)
        this.inspectionInFlight.delete(input.cwd);
    }
  }

  private async inspectNative(input: InspectHarnessInput): Promise<HarnessInspection> {
    if (this.closed)
      return {
        status: "unavailable",
        error: { code: "invalidState", message: "Codex Adapter is closed", retryable: false },
      };
    if (!installed(this.command, this.environment)) {
      return {
        status: "notInstalled",
        error: { code: "notInstalled", message: "Codex CLI is not installed", retryable: false },
      };
    }
    const server = new CodexAppServer({
      command: this.command,
      environment: this.environment,
      ...(input.cwd ? { cwd: input.cwd } : {}),
      sensitive: true,
      requestTimeoutMs: 15_000,
    });
    this.inspections.add(server);
    try {
      await server.initialize();
      const response = await server.request<{
        data: Array<{
          id: string;
          displayName: string;
          description: string;
          hidden: boolean;
          isDefault: boolean;
          supportedReasoningEfforts: Array<{ reasoningEffort: string }>;
          defaultReasoningEffort: string;
        }>;
      }>("model/list", { limit: 100 });
      const models = response.data.filter(
        (model) => !model.hidden && /^[A-Za-z0-9._~-]+$/u.test(model.id),
      );
      const efforts = new Set<string>();
      for (const model of models)
        for (const option of model.supportedReasoningEfforts) efforts.add(option.reasoningEffort);
      const thinkingOptions = [...efforts]
        .sort((a, b) => EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b))
        .map((id) => ({ id, label: EFFORT_LABELS[id] ?? id }));
      const defaultModel = models.find((model) => model.isDefault) ?? models[0];
      return harnessInspectionSchema.parse({
        status: "ready",
        catalog: {
          models: models.map((model) => ({
            ref: { id: model.id },
            label: model.displayName,
            supportedThinkingOptionIds: model.supportedReasoningEfforts.map(
              (option) => option.reasoningEffort,
            ),
          })),
          ...(defaultModel === undefined ? {} : { defaultModel: { id: defaultModel.id } }),
          thinkingOptions,
          ...(defaultModel !== undefined && efforts.has(defaultModel.defaultReasoningEffort)
            ? { defaultThinkingOptionId: defaultModel.defaultReasoningEffort }
            : {}),
        },
        permissionModes: {
          modes: PERMISSION_MODES.map((mode) => ({
            id: mode.id,
            label: mode.label,
            description: mode.description,
            ...(mode.dangerous === true ? { dangerous: true } : {}),
          })),
          defaultModeId: DEFAULT_PERMISSION_MODE,
        },
        capabilities: {
          configuration: {
            selectModel: true,
            selectThinkingOption: true,
            selectPermissionMode: true,
            permissionModeScope: "live",
          },
          history: { fork: false, forkAcrossCwd: false, rollbackLastTurn: false },
        },
      });
    } catch (error) {
      return {
        status: "unavailable",
        error: {
          code: "unavailable",
          retryable: true,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    } finally {
      await server.close();
      this.inspections.delete(server);
    }
  }

  async open(input: OpenSessionInput): Promise<Result<CodexSession>> {
    if (input.kind !== "create" && input.kind !== "resume") {
      return {
        ok: false,
        error: {
          code: "unsupported",
          message: `Codex sessions cannot ${input.kind}`,
          retryable: false,
        },
      };
    }
    const threadId = input.kind === "resume" ? this.threadId(input.nativeRef) : undefined;
    if (threadId && !threadId.ok) return threadId;
    try {
      if (this.closed)
        return {
          ok: false,
          error: { code: "invalidState", message: "Codex Adapter is closed", retryable: false },
        };
      const result = await CodexSession.open({
        command: this.command,
        codexHome: this.home,
        environment: this.environment,
        cwd: input.cwd,
        ...(threadId?.ok ? { threadId: threadId.value } : {}),
        ...(typeof (input.model as { id?: unknown } | undefined)?.id === "string"
          ? { model: (input.model as { id: string }).id }
          : {}),
        ...(typeof input.thinkingOptionId === "string" ? { effort: input.thinkingOptionId } : {}),
        ...(typeof input.permissionModeId === "string"
          ? { permissionModeId: input.permissionModeId }
          : {}),
      });
      if (this.closed && result.ok) {
        await result.value.close();
        return {
          ok: false,
          error: { code: "invalidState", message: "Codex Adapter is closed", retryable: false },
        };
      }
      return result;
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "nativeFailure",
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        },
      };
    }
  }

  readonly sessionImport: Required<HarnessSessionImportCapability> = {
    listCandidates: async () => {
      try {
        const server = await this.controlServer();
        const response = await server.request<{
          data: Array<{
            id: string;
            name: string | null;
            preview: string;
            cwd: string;
            updatedAt: number;
            ephemeral: boolean;
            parentThreadId: string | null;
          }>;
        }>("thread/list", { limit: 200, sortKey: "updated_at" });
        return {
          ok: true,
          value: response.data
            .filter((thread) => !thread.ephemeral && thread.parentThreadId === null)
            .map((thread) => ({
              nativeSessionId: thread.id,
              title:
                (
                  thread.name ??
                  thread.preview
                    .split("\n")
                    .find((line) => line.trim() !== "" && !line.startsWith("#")) ??
                  ""
                )
                  .trim()
                  .slice(0, 200) || null,
              updatedAt: thread.updatedAt * 1000,
              cwd: thread.cwd,
              running: null,
            })),
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "unavailable",
            message: error instanceof Error ? error.message : String(error),
            retryable: true,
          },
        };
      }
    },
    resolveCandidate: async (nativeSessionId: string) => {
      const list = await this.sessionImport.listCandidates();
      if (!list.ok) return list;
      const candidate = list.value.find((entry) => entry.nativeSessionId === nativeSessionId);
      if (candidate === undefined)
        return {
          ok: false,
          error: { code: "sessionNotFound", message: "Codex thread not found", retryable: false },
        };
      return {
        ok: true,
        value: {
          candidate,
          nativeRef: nativeSessionRefSchema.parse({
            formatVersion: 1,
            harnessId: HARNESS_ID,
            nativeSessionId,
            locator: { codexHome: this.home },
          }),
        },
      };
    },
  };

  /** Read a thread from the configured native home without loading it for execution. */
  async readHistory(nativeRef: unknown): Promise<Result<HostThreadSnapshot>> {
    const threadId = this.threadId(nativeRef);
    if (!threadId.ok) return threadId;
    try {
      const server = await this.controlServer();
      const response = await server.request<{
        thread: {
          turns: Array<{
            id: string;
            items: CodexItem[];
            status: string;
            error: { message?: string } | null;
            startedAt: number | null;
            completedAt: number | null;
          }>;
        };
      }>("thread/read", { threadId: threadId.value, includeTurns: true });
      return {
        ok: true,
        value: { turns: response.thread.turns.map((turn) => snapshotTurn(threadId.value, turn)) },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "nativeFailure",
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        },
      };
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    const control = this.control;
    this.control = undefined;
    await Promise.all([
      ...[...this.inspections].map((server) => server.close()),
      control?.catch(() => undefined).then((server) => server?.close()),
    ]);
  }
}

export function createHarnessAdapter(context: HarnessPluginContext): CodexAdapter {
  return new CodexAdapter(context);
}
