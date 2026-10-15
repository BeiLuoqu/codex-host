import path from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { developmentArtifacts, npmBuildInvocation, validateDevelopmentArtifacts } from "./run.mjs";

async function confirmRestart() {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("npm start host requires an interactive terminal to confirm task interruption");
  }
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    return (
      (await terminal.question("Restart shared Host and interrupt its running tasks? [y/N] "))
        .trim()
        .toLowerCase() === "y"
    );
  } finally {
    terminal.close();
  }
}

/** Development orchestration only; the native Launcher owns shutdown and readiness. */
export async function runDevelopmentHost(
  arguments_,
  {
    root,
    environment,
    platform,
    nodePath,
    run,
    confirm = confirmRestart,
    validate = validateDevelopmentArtifacts,
  },
) {
  if (arguments_.length) {
    if (arguments_.length === 1 && ["--help", "-h"].includes(arguments_[0])) {
      console.log(
        "usage: npm start host\n\nBuild and restart the shared Host after confirmation. Running tasks will be interrupted; Desktop and Web are not restarted.",
      );
      return 0;
    }
    throw new Error("usage: npm start host (no options)");
  }
  const env = { ...environment };
  for (const key of Object.keys(env)) {
    if (key.startsWith("CODEXHOST_NPM_") || key === "CODEXHOST_DEV_VERSION") delete env[key];
  }
  for (const script of ["build:typescript", "build:rust"]) {
    const result = await run(npmBuildInvocation(env, platform, nodePath, script), env);
    if (result.code !== 0) return result.code ?? 1;
  }
  const all = developmentArtifacts(root, platform, nodePath);
  const { launcher, node, hostRuntime } = all;
  validate({ launcher, node, hostRuntime });
  if (!(await confirm())) {
    console.log("codexhost dev: cancelled; shared Host was not stopped");
    return 0;
  }
  const args = [
    "--node",
    node,
    "--host-runtime",
    hostRuntime,
    "--data",
    path.resolve(env.CODEXHOST_DATA_DIR || path.join(homedir(), ".codexhost")),
  ];
  for (const action of ["stop", "ensure"]) {
    const result = await run({ command: launcher, arguments: ["host", action, ...args] }, env);
    if (result.code !== 0) {
      throw new Error(`Shared Host ${action} failed; automatic restart was not completed`);
    }
  }
  console.log(
    "codexhost dev: shared Host is ready; clients may reconnect. Interrupted tasks are not replayed.",
  );
  return 0;
}
