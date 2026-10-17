import type {
  HarnessAdapter,
  HarnessSession,
  HarnessInspection,
  HarnessPermissionModeCatalog,
} from "@codexhost/harness-adapter";
export type Adapter = HarnessAdapter;
export type HarnessSessionLike = HarnessSession;
export type Inspection = HarnessInspection;
export type PermissionModeCatalog = HarnessPermissionModeCatalog;

export interface SessionDataStore {
  path(...parts: string[]): string;
  readJson<T>(relative: string, fallback: T): T;
  writeJson(relative: string, value: unknown): void;
  readLines<T>(relative: string): T[];
  writeLines(relative: string, values: readonly unknown[]): void;
  appendLine(relative: string, value: unknown): void;
}
export interface SessionSink {
  readonly id: string;
  readonly closed: boolean;
  push(value: unknown): void;
  end(): void;
  fail(code: string, message: string): void;
  onClose(listener: () => void): void;
}
export class SessionRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: object = {},
  ) {
    super(message);
  }
}
export function requestOf<T>(args: Record<string, unknown>): T {
  return ("request" in args ? args.request : "_request" in args ? args._request : args) as T;
}
export interface SessionOrganization {
  get(id: string): { workspaceId: string; path: string } | undefined;
  ownerOf(id: string): { workspaceId: string } | undefined;
  attachSession(id: string, workspaceId: string | undefined, cwd: string): void;
}
export interface SessionObserver {
  changed(kind: string, ...args: unknown[]): void;
  interaction(
    sessionId: string,
    interaction: Record<string, unknown> & { type: string },
  ): { result: Promise<unknown>; cancel(): void };
}
export interface SessionHarnesses {
  ids(): string[];
  manifest(id: string): { name: string } | undefined;
  adapter(id: string): Promise<Adapter>;
  inspect(id: string): Promise<Inspection>;
  preferredSelection: { provider: string; model: string; reasoningEffort?: string } | undefined;
  modelCatalog(): Promise<{
    default: { provider: string; model: string; reasoningEffort?: string };
    groups: Array<{ id: string; models: Array<{ id: string }> }>;
    routableProviders: string[];
    failures: Array<{ id: string; name: string; message: string }>;
  }>;
  preferences?:
    | {
        configuration(id: string): Promise<
          | {
              permissionModeId?: string | undefined;
              model?: { id: string } | undefined;
              thinkingOptionId?: string | undefined;
            }
          | undefined
        >;
        remember(
          id: string,
          configuration: {
            model?: { id: string };
            thinkingOptionId?: string | undefined;
            permissionModeId?: string | undefined;
          },
        ): Promise<void>;
      }
    | undefined;
}
