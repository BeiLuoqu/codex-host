import { describe, expect, it, vi } from "vitest";
import { runDevelopmentHost } from "./host.mjs";

function fixture() {
  const calls = [];
  const options = {
    root: "/repo",
    platform: "linux",
    nodePath: "/node",
    environment: {
      npm_execpath: "/npm.mjs",
      CODEXHOST_DATA_DIR: "/data",
      CODEXHOST_NPM_PACKAGE_ROOT: "/old",
    },
    run: vi.fn(async (invocation, env) => {
      calls.push({ ...invocation, env });
      return { code: 0 };
    }),
    confirm: vi.fn(async () => true),
    validate: vi.fn(),
  };
  return { calls, options };
}

describe("npm start host", () => {
  it("builds before confirmation and uses native stop/ensure without Desktop cleanup", async () => {
    const { calls, options } = fixture();
    options.confirm.mockImplementation(async () => {
      expect(calls).toHaveLength(2);
      return true;
    });
    expect(await runDevelopmentHost([], options)).toBe(0);
    expect(calls.map((call) => call.arguments.slice(0, 3))).toEqual([
      ["/npm.mjs", "run", "build:typescript"],
      ["/npm.mjs", "run", "build:rust"],
      ["host", "stop", "--node"],
      ["host", "ensure", "--node"],
    ]);
    expect(calls[3].arguments).toContain("/repo/packages/host-runtime/dist/main.js");
    expect(calls[3].arguments).toContain("/data");
    expect(calls[3].env).not.toHaveProperty("CODEXHOST_NPM_PACKAGE_ROOT");
    expect(options.validate).toHaveBeenCalledWith({
      launcher: "/repo/target/debug/codexhost",
      node: "/node",
      hostRuntime: "/repo/packages/host-runtime/dist/main.js",
    });
  });

  it.each([0, 1])("keeps the Host running if build step %s fails", async (index) => {
    const { calls, options } = fixture();
    options.run.mockImplementation(async (invocation) => {
      calls.push(invocation);
      return { code: calls.length === index + 1 ? 2 : 0 };
    });
    expect(await runDevelopmentHost([], options)).toBe(2);
    expect(options.confirm).not.toHaveBeenCalled();
    expect(calls).toHaveLength(index + 1);
  });

  it("does not stop on cancellation or artifact validation failure", async () => {
    const { calls, options } = fixture();
    options.confirm.mockResolvedValue(false);
    expect(await runDevelopmentHost([], options)).toBe(0);
    expect(calls).toHaveLength(2);
    options.validate.mockImplementation(() => {
      throw new Error("missing artifact");
    });
    await expect(runDevelopmentHost([], options)).rejects.toThrow("missing artifact");
    expect(calls).toHaveLength(4);
  });

  it("does not ensure if native shutdown fails", async () => {
    const { calls, options } = fixture();
    options.run.mockImplementation(async (invocation) => {
      calls.push(invocation);
      return { code: invocation.arguments[1] === "stop" ? 1 : 0 };
    });
    await expect(runDevelopmentHost([], options)).rejects.toThrow("stop failed");
    expect(calls).toHaveLength(3);
  });

  it("handles help and rejects unknown options without building or stopping", async () => {
    const { calls, options } = fixture();
    expect(await runDevelopmentHost(["--help"], options)).toBe(0);
    await expect(runDevelopmentHost(["--yes"], options)).rejects.toThrow("usage:");
    expect(calls).toHaveLength(0);
  });
});
