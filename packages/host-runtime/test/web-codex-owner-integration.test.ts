import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SharedWebCodexOwner } from "../src/web-codex-owner.js";
import { ClientChannelEvents } from "../src/client-channel-events.js";
import { startClientChannelServer } from "../src/client-channel-server.js";

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
function json(file: string, value: unknown): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}
async function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "web-codex-owner-integration-")));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const plugins = join(root, "plugins"),
    home = join(root, "isolated-home"),
    data = join(root, "host");
  const source = join(data, "web-codex");
  mkdirSync(home);
  mkdirSync(join(plugins, "codex"), { recursive: true });
  json(join(plugins, "codex", "manifest.json"), {
    manifestVersion: 1,
    id: "codex",
    name: "Synthetic Codex",
    version: "1.0.0",
    adapterApiVersion: 1,
    entry: "./plugin.mjs",
  });
  writeFileSync(
    join(plugins, "codex", "plugin.mjs"),
    `
export function createHarnessAdapter() {
  return { harnessId: 'codex', inspect: async () => ({ status:'ready', catalog:{ models:[{ref:{id:'fake'},label:'Fake'}],defaultModel:{id:'fake'},thinkingOptions:[] }, capabilities:{configuration:{selectModel:true,selectThinkingOption:false,selectPermissionMode:false},history:{fork:false,forkAcrossCwd:false,rollbackLastTurn:false}} }),
    open: async () => { throw new Error('No model submissions in this test'); }, close: async () => {} };
}
`,
  );
  json(join(source, "sessions/index.json"), {
    kept: {
      sessionId: "kept",
      cwd: root,
      createdAt: 1,
      updatedAt: 2,
      blank: false,
      harnessId: "codex",
      nativeRef: {
        harnessId: "codex",
        nativeSessionId: "native-kept",
        locator: { codexHome: home },
      },
      checkpoints: { "1": { nativeTurnKey: "native-turn" } },
    },
  });
  json(join(source, "sessions/kept/projections.json"), { title: "Saved title" });
  writeFileSync(
    join(source, "sessions/kept/events.jsonl"),
    JSON.stringify({ seq: 0, type: "session/title", time: 1, data: { title: "Saved title" } }) +
      "\n",
  );
  json(join(source, "organization-v1.json"), {
    version: 1,
    items: [
      {
        workspaceId: "workspace",
        path: root,
        title: "Original",
        origin: "web",
        sessionIds: ["kept"],
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(2).toISOString(),
      },
    ],
    archivedSessionIds: [],
    pinnedSessionIds: ["kept"],
  });
  const environment = {
    HOME: join(root, "user"),
    CODEXHOST_DATA_DIR: data,
    CODEXHOST_GUI_CODEX_HOME: join(root, "official-home"),
  };
  const preferences = async (_method: string, input: Record<string, unknown>) => ({
    scope: input.scope,
    revision: 0,
    values: { favorites: {} },
  });
  const events = new ClientChannelEvents();
  const owner = new SharedWebCodexOwner(
    environment,
    events,
    async (id) => id === "official-id",
    preferences,
  );
  cleanup.push(() => owner.close());
  const server = await startClientChannelServer({
    target: {
      clientEvents: events,
      webCodex: owner,
      handleClientRequest: async () => {
        throw new Error("external route unused");
      },
      clientSnapshot: async () => {
        throw new Error("external route unused");
      },
      respondClient: async () => ({ resolved: false }),
    },
    environment,
    directory: join(data, "client-hosts"),
  });
  cleanup.push(() => server.close());
  const post = async (route: string, value: unknown, authenticated = true) => {
    const response = await fetch(
      `http://127.0.0.1:${server.descriptor.port}/v1/web-codex/${route}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(authenticated ? { authorization: `Bearer ${server.descriptor.token}` } : {}),
        },
        body: JSON.stringify(value),
      },
    );
    return {
      status: response.status,
      body: (await response.json()) as { result?: unknown; error?: { message: string } },
    };
  };
  return {
    root,
    home,
    data,
    source,
    environment,
    preferences,
    owner,
    events,
    post,
    configuration: { home, command: process.execPath, pluginRoots: [plugins] },
  };
}

describe("production owner over private authenticated HTTP", () => {
  it("restores shared sessions and organization after a normal owner restart", async () => {
    const f = await fixture();
    expect((await f.post("configure", f.configuration, false)).status).toBe(401);
    const configured = await f.post("configure", f.configuration);
    expect(configured.status).toBe(200);
    const reply = configured.body.result as { scope: string; sessionIds: string[] };
    expect(reply.sessionIds).toEqual(["kept"]);
    const request = (action: string, input: Record<string, unknown> = {}) =>
      f.post("request", {
        epoch: f.events.epoch,
        address: { scope: reply.scope, ...(input.sessionId ? { sessionId: input.sessionId } : {}) },
        operation: "organization",
        input: { action, ...input },
      });
    expect((await request("rename", { workspaceId: "workspace", title: "Confirmed" })).status).toBe(
      200,
    );
    expect((await request("archive", { sessionId: "kept" })).status).toBe(200);
    expect((await request("pin", { sessionId: "official-id" })).body.error?.message).toContain(
      "session-not-found",
    );
    await f.owner.close();
    const recovered = new SharedWebCodexOwner(
      f.environment,
      new ClientChannelEvents(),
      async () => false,
      f.preferences,
    );
    cleanup.push(() => recovered.close());
    await recovered.initialize();
    const description = await recovered.configure(f.configuration);
    const restored = (await recovered.request({
      epoch: description.cursor.epoch,
      address: { scope: description.scope },
      operation: "organization",
      input: { action: "snapshot" },
    })) as {
      items: Array<{ title: string }>;
      archivedSessionIds: string[];
      pinnedSessionIds: string[];
    };
    expect(restored.items[0]?.title).toBe("Confirmed");
    expect(restored.archivedSessionIds).toEqual(["kept"]);
    expect(restored.pinnedSessionIds).toEqual(["kept"]);
    expect(
      JSON.parse(readFileSync(join(f.source, "sessions/index.json"), "utf8")).kept.nativeRef.locator
        .codexHome,
    ).toBe(f.home);
  });

  it("does not inspect, overwrite or remove ownership artifacts", async () => {
    const f = await fixture();
    const artifacts = [
      join(f.home, ".codexhost-source-owner-v1.lock"),
      join(f.source, "source-owner-v1.lock"),
      join(f.source, "source-owner-v1.lock.reap"),
      join(f.data, "shared-host-exit-v1.json"),
      join(f.source, "source-migrated-v1.json"),
    ];
    for (const file of artifacts) writeFileSync(file, "leave untouched");
    expect((await f.post("configure", f.configuration)).status).toBe(200);
    await f.owner.close();
    for (const file of artifacts) expect(readFileSync(file, "utf8")).toBe("leave untouched");
    expect(existsSync(join(f.source, "migration-mutated-v1.json"))).toBe(false);
  });

  it("rejects configuration conflicts and forged requests without enforcing cross-Host home ownership", async () => {
    const f = await fixture();
    const configured = await f.post("configure", f.configuration);
    expect(configured.status).toBe(200);
    const reply = configured.body.result as { scope: string };
    expect((await f.post("configure", f.configuration)).body.result).toEqual(
      configured.body.result,
    );
    const other = join(f.root, "other-home");
    mkdirSync(other);
    expect(
      (await f.post("configure", { ...f.configuration, home: other })).body.error?.message,
    ).toContain("scope-conflict");
    const second = new SharedWebCodexOwner(
      { ...f.environment, CODEXHOST_DATA_DIR: join(f.root, "another-host") },
      new ClientChannelEvents(),
      async () => false,
      f.preferences,
    );
    cleanup.push(() => second.close());
    expect((await second.configure(f.configuration)).scope).toBe(reply.scope);
    for (const input of [
      { request: { home: other } },
      { nativeRef: { nativeSessionId: "official-id" } },
      { home: other },
      { adapter: "official" },
    ]) {
      expect(
        (
          await f.post("request", {
            epoch: f.events.epoch,
            address: { scope: reply.scope },
            operation: "list",
            input,
          })
        ).body.error,
      ).toBeDefined();
    }
    expect(
      (
        await f.post("request", {
          epoch: f.events.epoch,
          address: { scope: `web-codex:${"0".repeat(64)}` },
          operation: "list",
          input: {},
        })
      ).body.error?.message,
    ).toContain("scope-unknown");
    expect(
      (
        await f.post("configure", {
          ...f.configuration,
          home: f.environment.CODEXHOST_GUI_CODEX_HOME,
        })
      ).body.error?.message,
    ).toContain("scope-conflict");
    for (const field of ["migrateSource", "legacySource", "legacyWriterStopped"]) {
      expect(
        (await f.post("configure", { ...f.configuration, [field]: true })).body.error,
      ).toBeDefined();
    }
  });

  it("accepts the GUI native home while rejecting official session addresses", async () => {
    const f = await fixture();
    const home = f.environment.CODEXHOST_GUI_CODEX_HOME;
    mkdirSync(home, { recursive: true });
    const configured = await f.post("configure", { ...f.configuration, home });
    expect(configured.body.error).toBeUndefined();
    const reply = configured.body.result as { scope: string };
    const request = await f.post("request", {
      epoch: f.events.epoch,
      address: { scope: reply.scope, sessionId: "official-id" },
      operation: "prompt",
      input: { requestId: "forbidden", content: [{ type: "text", text: "no" }], mode: "queue" },
    });
    expect(request.body.error?.message).toContain("session-not-found");
  });

  it("scopes submission receipts to the complete session address and input", async () => {
    const f = await fixture();
    const reply = (await f.post("configure", f.configuration)).body.result as { scope: string };
    const request = (operation: string, input: Record<string, unknown>, sessionId?: string) =>
      f.post("request", {
        epoch: f.events.epoch,
        address: { scope: reply.scope, ...(sessionId ? { sessionId } : {}) },
        operation,
        input,
      });
    const one = (await request("create", { cwd: f.root })).body.result as { sessionId: string };
    const two = (await request("create", { cwd: f.root })).body.result as { sessionId: string };
    const prompt = {
      requestId: "same-request",
      mode: "queue",
      content: [{ type: "text", text: "receipt test" }],
    };
    expect((await request("prompt", prompt, one.sessionId)).body.result).toEqual({
      accepted: true,
    });
    expect((await request("prompt", prompt, one.sessionId)).body.result).toEqual({
      accepted: true,
    });
    expect((await request("prompt", prompt, two.sessionId)).body.result).toEqual({
      accepted: true,
    });
    expect(
      (
        await request(
          "prompt",
          { ...prompt, content: [{ type: "text", text: "changed" }] },
          one.sessionId,
        )
      ).body.error?.message,
    ).toContain("request-id-conflict");
    for (const id of [one.sessionId, two.sessionId]) {
      const log = readFileSync(join(f.source, "sessions", id, "events.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(log.filter((event) => event.type === "user/message")).toHaveLength(1);
    }
  });
});
