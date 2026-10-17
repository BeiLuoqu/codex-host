import type { HarnessSession } from "@codexhost/harness-adapter";
import { hostTurnIdSchema, type HostTurnId } from "@codexhost/shared-contracts";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHarnessAdapter } from "../src/plugin.ts";
import { CodexAppServer } from "../src/rpc.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0)) await fn();
});
function fixture(scenario: object = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "codex-local-auth-")));
  const home = join(root, ".codex");
  mkdirSync(home);
  const command = join(root, "codex");
  writeFileSync(
    command,
    `#!${process.execPath}\n${readFileSync(resolve("tests/fixtures/codex-auth-peer.cjs"), "utf8")}`,
  );
  chmodSync(command, 0o700);
  writeFileSync(join(home, "scenario.json"), JSON.stringify(scenario));
  const adapter = createHarnessAdapter({
    platform: process.platform,
    managedRemoteHost: false,
    environment: {
      HOME: root,
      CODEX_HOME: home,
      CODEXHOST_GUI_CODEX_HOME: home,
      CODEXHOST_CODEX_COMMAND: command,
    },
  });
  cleanups.push(async () => {
    await adapter.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    adapter,
    home,
    command,
    methods: () =>
      readFileSync(join(home, "rpc.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line).method) as string[],
  };
}
async function turn(session: HarnessSession, turnId: HostTurnId, text: string) {
  expect(
    await session.execute({ type: "turn.start", turnId, input: [{ type: "text", text }] }),
  ).toMatchObject({ ok: true });
  for await (const output of session.outputs) {
    if (output.kind === "event" && output.event.type === "turn.completed")
      return output.event.outcome;
  }
  throw Error("Missing native Turn completion");
}

it.skipIf(process.platform === "win32")(
  "uses local credentials without account preflight and returns native failure normally",
  async () => {
    const f = fixture({ requireAuth: true });
    expect((await f.adapter.inspect()).status).toBe("ready");
    expect(f.methods()).not.toContain("thread/start");
    const opened = await f.adapter.open({ kind: "create", cwd: f.home });
    if (!opened.ok) throw Error(opened.error.message);
    try {
      expect(
        await turn(opened.value, hostTurnIdSchema.parse("missing-auth"), "hello"),
      ).toMatchObject({
        status: "failed",
        error: { code: "nativeFailure", message: "Native model unauthorized" },
      });
    } finally {
      await opened.value.close();
    }
    writeFileSync(join(f.home, "authenticated.json"), "true");
    const retried = await f.adapter.open({ kind: "create", cwd: f.home });
    if (!retried.ok) throw Error(retried.error.message);
    try {
      expect(
        await turn(retried.value, hostTurnIdSchema.parse("local-auth"), "hello"),
      ).toMatchObject({ status: "succeeded" });
    } finally {
      await retried.value.close();
    }
    expect(f.methods().some((m) => m.startsWith("account/"))).toBe(false);
  },
);

it.skipIf(process.platform === "win32")(
  "returns native steering errors without authentication state or cancel-and-replay",
  async () => {
    const f = fixture({ turnDelay: 500, steerReject: true, steerUnauthorized: true });
    const opened = await f.adapter.open({ kind: "create", cwd: f.home });
    if (!opened.ok) throw Error(opened.error.message);
    const turnId = hostTurnIdSchema.parse("steer-test");
    try {
      await opened.value.execute({
        type: "turn.start",
        turnId,
        input: [{ type: "text", text: "hello" }],
      });
      expect(
        await opened.value.steer({ turnId, input: [{ type: "text", text: "change" }] }),
      ).toMatchObject({
        ok: false,
        error: { code: "nativeFailure", message: "turn/steer: cannot steer" },
      });
      expect((await f.adapter.inspect()).status).toBe("ready");
      expect(f.methods().filter((m) => m === "turn/start")).toHaveLength(1);
      expect(f.methods()).not.toContain("turn/interrupt");
      expect(f.methods().some((m) => m.startsWith("account/"))).toBe(false);
    } finally {
      await opened.value.close();
    }
  },
);

it.skipIf(process.platform === "win32")(
  "coalesces model inspections by workspace and closes native processes",
  async () => {
    const f = fixture({ modelWaitFile: "release" });
    const pending = f.adapter.inspect({ cwd: f.home });
    const concurrent = f.adapter.inspect({ cwd: f.home });
    await expect.poll(() => f.methods().filter((m) => m === "model/list").length).toBe(1);
    writeFileSync(join(f.home, "release"), "yes");
    expect((await Promise.all([pending, concurrent])).map((v) => v.status)).toEqual([
      "ready",
      "ready",
    ]);
    expect(f.methods().some((m) => m.startsWith("account/"))).toBe(false);
  },
);

it.skipIf(process.platform === "win32")(
  "bounds model control requests and closes in-flight inspections",
  async () => {
    const f = fixture({ modelWaitFile: "never" });
    const server = new CodexAppServer({
      command: f.command,
      environment: { ...process.env, CODEX_HOME: f.home },
      requestTimeoutMs: 1000,
    });
    try {
      await server.initialize();
      await expect(server.request("model/list", {})).rejects.toThrow("timed out");
    } finally {
      await server.close();
    }
    const pending = f.adapter.inspect();
    await expect.poll(() => f.methods().filter((m) => m === "model/list").length).toBe(2);
    await f.adapter.close();
    expect((await pending).status).toBe("unavailable");
    expect((await f.adapter.inspect()).status).toBe("unavailable");
  },
);
