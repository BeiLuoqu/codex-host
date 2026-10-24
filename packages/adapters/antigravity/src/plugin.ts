import type { HarnessAdapter } from "@codexhost/harness-adapter";
import type { HarnessPluginContext } from "@codexhost/harness-adapter/plugin";

import { createHarnessInstaller } from "@codexhost/harness-discovery";
import { AntigravityAdapter } from "./antigravity-adapter.js";
import { createAntigravityInstallation } from "./installation.js";

export const ANTIGRAVITY_COMMAND_ENV = "CODEXHOST_ANTIGRAVITY_COMMAND";
/** agy's documented switch for its background self-updater. */
export const ANTIGRAVITY_DISABLE_AUTO_UPDATE_ENV = "AGY_CLI_DISABLE_AUTO_UPDATE";

/**
 * Environment for the agy processes the Adapter starts: Sessions, the Model catalog and quota.
 * On Windows, agy's background self-updater re-runs agy (`--version`) from a detached process,
 * and that console child opens a visible terminal window that `windowsHide` cannot reach. The
 * updater is therefore switched off there unless the user configured the switch. Updates stay
 * explicit through the Harness update action, which keeps the unmodified environment.
 */
export function antigravityProcessEnvironment(
  environment: NodeJS.ProcessEnv,
  platform: string,
): NodeJS.ProcessEnv {
  if (platform !== "win32") return environment;
  // Windows environment names are case-insensitive, and an undefined value never reaches agy.
  const configured = Object.entries(environment).some(
    ([name, value]) =>
      value !== undefined && name.toUpperCase() === ANTIGRAVITY_DISABLE_AUTO_UPDATE_ENV,
  );
  return configured
    ? environment
    : { ...environment, [ANTIGRAVITY_DISABLE_AUTO_UPDATE_ENV]: "true" };
}

export function createHarnessAdapter(context: HarnessPluginContext): AntigravityAdapter {
  const environment = { ...context.environment };
  return Object.assign(
    new AntigravityAdapter({
      ...(environment[ANTIGRAVITY_COMMAND_ENV]
        ? { command: environment[ANTIGRAVITY_COMMAND_ENV] }
        : {}),
      environment: antigravityProcessEnvironment(environment, context.platform),
    }),
    {
      install: createHarnessInstaller(environment, {
        posix: "https://antigravity.google/cli/install.sh",
        windows: "https://antigravity.google/cli/install.ps1",
      }),
      installation: createAntigravityInstallation(
        environment,
        environment[ANTIGRAVITY_COMMAND_ENV],
      ),
    },
  );
}

export async function warmup(adapter: Pick<HarnessAdapter, "inspect">): Promise<void> {
  try {
    await adapter.inspect();
  } catch {
    /* Optional prefetch cannot fail Host startup. */
  }
}
