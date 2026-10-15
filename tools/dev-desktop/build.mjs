/** Quiet Web builds: bound captured diagnostics and show them only on failure. */
import { spawn } from "node:child_process";

export async function runQuietWebBuild(
  invocation,
  { root, environment, spawnImplementation = spawn },
) {
  const startedAt = performance.now();
  console.log("codexhost web: building…");
  let output = "";
  const result = await new Promise((resolve, reject) => {
    const child = spawnImplementation(invocation.command, invocation.arguments, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      env: environment,
      windowsHide: false,
    });
    const capture = (chunk) => {
      output = (output + String(chunk)).slice(-64_000);
    };
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    child.once("error", reject);
    // Wait for pipes to drain, not just process exit, so final errors are retained.
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const elapsed = ((performance.now() - startedAt) / 1000).toFixed(2);
  if (result.code === 0) {
    console.log(`codexhost web: build complete (${elapsed}s)`);
  } else {
    const reason = result.signal ? `signal ${result.signal}` : `status ${result.code ?? "unknown"}`;
    console.error(`codexhost web: build failed (${reason}, ${elapsed}s)`);
    if (output) console.error(output.trimEnd());
    console.error("Run npm run build:web for the full build output.");
  }
  return result;
}
