import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";
import {
  authenticationHost,
  authenticationRpc as rpc,
  eventually,
} from "./support/codex-authentication.ts";

it(
  "uses local auth without preflight, preserves ordinary queue behavior and rejects Web login APIs",
  { timeout: 30000 },
  async (t) => {
    if (process.platform === "win32") return t.skip("Synthetic CLI uses a shebang");
    const f = await authenticationHost(t, true);
    writeFileSync(join(f.home, "authenticated.json"), "true");
    writeFileSync(
      join(f.home, "scenario.json"),
      JSON.stringify({ turnDelay: 500, steerReject: true }),
    );
    const url = await f.start();
    for (const action of ["read", "start", "cancel"])
      await assert.rejects(rpc(url, `codexhost/web-codex/authentication/${action}`), /no handler/);
    const configured = await f.owner.configure({
      home: f.home,
      command: f.command,
      pluginRoots: [join(process.cwd(), "../adapters")],
    });
    assert.equal("authentication" in configured, false);
    for (const operation of ["authenticationRead", "authenticationStart", "authenticationCancel"])
      await assert.rejects(
        f.owner.request({
          epoch: configured.cursor.epoch,
          address: { scope: configured.scope },
          operation,
          input: {},
        }),
      );
    const call = (operation: string, input: Record<string, unknown> = {}, id?: string) =>
      f.owner.request({
        epoch: configured.cursor.epoch,
        address: { scope: configured.scope, ...(id ? { sessionId: id } : {}) },
        operation,
        input,
      });
    const catalog = await rpc<{ groups: Array<{ id: string }> }>(url, "session/modelCatalog");
    assert.ok(catalog.groups.some((group) => group.id === "codex"));
    const { sessionId: id } = await rpc<{ sessionId: string }>(url, "session/create", {});
    await rpc(url, "session/selectModel", {
      sessionId: id,
      provider: "codex",
      model: "test-model",
    });
    await rpc(url, "session/prompt", {
      sessionId: id,
      requestId: "first",
      mode: "queue",
      content: [{ type: "text", text: "reject-auth" }],
    });
    await eventually(() => f.methods().some((row) => row.method === "turn/start"));
    const start = f.methods().find((row) => row.method === "thread/start");
    assert.ok(String(start?.params?.cwd).startsWith(join(f.root, "Documents", "Codex") + "/"));
    assert.ok(String(start?.params?.cwd).endsWith("/reject-auth"));
    const organization = (await call("organization", { action: "snapshot" })) as {
      items: unknown[];
    };
    assert.deepEqual(organization.items, [], "execution directory must not become a project");
    await assert.rejects(
      call(
        "prompt",
        { requestId: "steer", mode: "steer", content: [{ type: "text", text: "not replayed" }] },
        id,
      ),
      /cannot steer/,
    );
    assert.equal(
      f.methods().some((row) => row.method === "turn/interrupt"),
      false,
    );
    await call(
      "prompt",
      { requestId: "queued", mode: "queue", content: [{ type: "text", text: "keep queued" }] },
      id,
    );
    const journal = join(f.root, "host/web-codex/sessions", id, "events.jsonl");
    await eventually(() => readFileSync(journal, "utf8").includes("Native model unauthorized"));
    await eventually(() => readFileSync(journal, "utf8").includes("Response keep queued"));
    assert.equal(f.methods().filter((row) => row.method === "turn/start").length, 2);
    await call(
      "prompt",
      { requestId: "retry", mode: "queue", content: [{ type: "text", text: "explicit retry" }] },
      id,
    );
    await eventually(() => readFileSync(journal, "utf8").includes("Response explicit retry"));
    const { sessionId: other } = (await call("create", { cwd: f.root })) as { sessionId: string };
    await call(
      "prompt",
      {
        requestId: "independent",
        mode: "queue",
        content: [{ type: "text", text: "other session" }],
      },
      other,
    );
    const otherJournal = join(f.root, "host/web-codex/sessions", other, "events.jsonl");
    await eventually(() => readFileSync(otherJournal, "utf8").includes("Response other session"));
    assert.equal(f.methods().filter((row) => row.method === "turn/start").length, 4);
    const projections = JSON.stringify(await call("projections", {}, id));
    assert.equal(projections.includes("authenticationRequired"), false);
    assert.equal(
      (await rpc<{ groups: Array<{ id: string }> }>(url, "session/modelCatalog")).groups.some(
        (group) => group.id === "codex",
      ),
      true,
    );
    assert.equal(
      f.methods().some((row) => row.method.startsWith("account/")),
      false,
    );
    assert.equal(
      f.external.requests.some((row) => row.method.startsWith("account/")),
      false,
    );
  },
);
