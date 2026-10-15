import { afterEach, expect, it, vi } from "vitest";
import { runQuietWebBuild } from "./build.mjs";

function run(script) {
  return runQuietWebBuild(
    { command: process.execPath, arguments: ["-e", script] },
    { root: process.cwd(), environment: process.env },
  );
}

afterEach(() => vi.restoreAllMocks());

it("hides successful build stdout and stderr, showing only progress and elapsed time", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const result = await run("console.log('dependency output'); console.error('build warning')");
  expect(result.code).toBe(0);
  expect(log).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenNthCalledWith(1, "codexhost web: building…");
  expect(log.mock.calls[1][0]).toMatch(/^codexhost web: build complete \(\d+\.\d{2}s\)$/u);
  expect(error).not.toHaveBeenCalled();
});

it("prints bounded diagnostics on failure, retaining final pipe output", async () => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const result = await run(
    "process.stderr.write('old-output' + 'x'.repeat(70000) + 'final build error', () => { process.exitCode = 7; });",
  );
  expect(result.code).toBe(7);
  expect(error.mock.calls[0][0]).toContain("build failed (status 7,");
  expect(error.mock.calls[1][0]).toHaveLength(64_000);
  expect(error.mock.calls[1][0]).not.toContain("old-output");
  expect(error.mock.calls[1][0]).toContain("final build error");
  expect(error.mock.calls[2][0]).toContain("npm run build:web");
});
