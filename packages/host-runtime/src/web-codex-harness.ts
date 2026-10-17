import {
  harnessIdSchema,
  harnessPreferenceSnapshotSchema,
  type WebCodexConfiguration,
} from "@codexhost/shared-contracts";
import type { SessionHarnesses } from "@codexhost/session-runtime";
import { loadHarnessPlugins, type HarnessPluginDiagnostic } from "./harness-plugin-loader.js";

/** One explicitly configured Web registry, separate from external execution. */
export async function createWebCodexHarness(
  config: WebCodexConfiguration,
  environment: NodeJS.ProcessEnv,
  scope: string,
  preferencesRequest: (method: string, params: Record<string, unknown>) => Promise<unknown>,
) {
  const diagnostics: HarnessPluginDiagnostic[] = [];
  const registry = await loadHarnessPlugins({
    roots: config.pluginRoots,
    scope: "web-codex",
    enabledIds: new Set(["codex"]),
    warmup: false,
    context: {
      environment: Object.freeze({
        ...environment,
        CODEXHOST_CODEX_HOME: config.home,
        CODEXHOST_CODEX_COMMAND: config.command,
      }),
      platform: process.platform,
      managedRemoteHost: false,
    },
    diagnose: (entry) => diagnostics.push(entry),
  });
  const adapter = registry.adapters.get(harnessIdSchema.parse("codex"));
  const manifest = registry.list().find((entry) => entry.id === "codex");
  const failure = diagnostics.find((entry) => entry.id === "codex");
  if (!adapter || !manifest || failure) {
    await registry.close();
    throw new Error(`Isolated Codex plugin unavailable: ${failure?.code ?? "notFound"}`);
  }
  const preference = async (method: string, params: Record<string, unknown>) =>
    harnessPreferenceSnapshotSchema.parse(await preferencesRequest(method, params));
  const harnesses: SessionHarnesses = {
    ids: () => ["codex"],
    manifest: (id) => (id === "codex" ? manifest : undefined),
    adapter: async (id) => {
      if (id !== "codex") throw new Error("Harness is outside the isolated source");
      return adapter;
    },
    inspect: async (id) => {
      if (id !== "codex") throw new Error("Harness is outside the isolated source");
      return adapter.inspect({ refresh: true });
    },
    preferredSelection: undefined,
    preferences: {
      configuration: async (id) => {
        if (id !== "codex") throw new Error("Harness is outside the isolated source");
        return (await preference("codexhost/harness/preferences/get", { scope })).values.newThread
          ?.byHarness.codex;
      },
      remember: async (id, configuration) => {
        if (id !== "codex") throw new Error("Harness is outside the isolated source");
        await preference("codexhost/harness/preferences/patch", {
          scope,
          operations: [{ kind: "newThread", harnessId: "codex", configuration }],
        });
      },
    },
    modelCatalog: async () => {
      const value = await harnesses.inspect("codex");
      if (value.status !== "ready")
        return {
          default: { provider: "none", model: "none" },
          groups: [],
          routableProviders: [],
          failures: [{ id: "codex", name: manifest.name, message: value.error.message }],
        };
      const options = new Map(
        value.catalog.thinkingOptions.map((option) => [option.id, option.label]),
      );
      const models = value.catalog.models.map((model) => {
        const supported = model.supportedThinkingOptionIds ?? [...options.keys()];
        const efforts = supported.map((id) => ({ id, name: options.get(id) ?? id }));
        return {
          id: model.ref.id,
          name: model.label,
          ...(efforts.length
            ? {
                reasoning: {
                  efforts,
                  ...(value.catalog.defaultThinkingOptionId
                    ? { defaultEffort: value.catalog.defaultThinkingOptionId }
                    : {}),
                },
              }
            : {}),
        };
      });
      const remembered = await harnesses.preferences?.configuration("codex");
      const preferred = harnesses.preferredSelection;
      const selected = preferred?.model ?? remembered?.model?.id ?? value.catalog.defaultModel?.id;
      const model = models.find((model) => model.id === selected) ?? models[0];
      const effort = preferred?.reasoningEffort ?? remembered?.thinkingOptionId;
      return {
        default: {
          provider: "codex",
          model: model?.id ?? "none",
          ...(effort ? { reasoningEffort: effort } : {}),
        },
        groups: [{ id: "codex", name: manifest.name, models }],
        routableProviders: ["codex"],
        failures: [],
      };
    },
  };
  return {
    harnesses,
    close: async () => {
      await registry.close();
    },
  };
}
