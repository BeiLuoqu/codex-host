import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { TestContext } from "node:test";
import { MixedChHost } from "./web-codex.ts";
import { startMixedSharedHost } from "./shared-mixed-host.ts";
import { startServer } from "./server.ts";

export async function authenticationHost(t: TestContext, useLocalDefault = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "web-authentication-")));
  const home = join(root, useLocalDefault ? "gui-home" : "web-home");
  mkdirSync(home);
  const command = join(root, "codex");
  writeFileSync(
    command,
    `#!${process.execPath}\n${readFileSync(resolve("../../tests/fixtures/codex-auth-peer.cjs"), "utf8")}`,
  );
  chmodSync(command, 0o700);
  const external = new MixedChHost();
  const shared = await startMixedSharedHost(t, root, resolve("../adapters"), external);
  const args = [...shared.args];
  args[args.indexOf("--codex-command") + 1] = command;
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (useLocalDefault) args.splice(args.indexOf("--codex-home"), 2);
  const start = () =>
    startServer(t, resolve("."), ["--import", "tsx", "src/main.ts"], args, {
      environment: { ...process.env, CODEX_HOME: home },
    });
  return {
    root,
    home,
    command,
    external,
    owner: shared.owner,
    start,
    methods: () =>
      readFileSync(join(home, "rpc.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)) as Array<{
        method: string;
        params?: Record<string, unknown>;
        pid: number;
      }>,
  };
}
export async function authenticationRpc<T = unknown>(
  url: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(new URL(`api/${method}`, url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "client-request",
      rpcId: crypto.randomUUID(),
      method,
      payload: { args },
    }),
  });
  const envelope = (await response.json()) as {
    result: { ok: boolean; value: T; error?: { message: string } };
  };
  if (!envelope.result.ok) throw Error(envelope.result.error?.message ?? "Request failed");
  return envelope.result.value;
}
export async function eventually(check: () => Promise<boolean> | boolean) {
  const deadline = Date.now() + 8000;
  while (!(await check())) {
    if (Date.now() > deadline) throw Error("Authentication condition timed out");
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}
