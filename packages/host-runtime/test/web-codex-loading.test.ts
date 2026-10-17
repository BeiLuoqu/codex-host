import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createWebCodexHarness } from "../src/web-codex-harness.js";
import { loadHarnessPlugins } from "../src/harness-plugin-loader.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(options: { version?: number; invalid?: boolean; kind?: "usage" } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "web-codex-loader-")));
  roots.push(root);
  const directory = join(root, "codex");
  await mkdir(directory);
  await writeFile(join(root, "enabled.json"), JSON.stringify({ version: 1, enabled: [] }));
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify({
      manifestVersion: 1,
      id: "codex",
      name: "Codex",
      version: "1.0.0",
      adapterApiVersion: options.version ?? 1,
      entry: "./plugin.mjs",
      ...(options.kind ? { kind: options.kind } : {}),
    }),
  );
  const imported = join(root, "imported"),
    created = join(root, "created"),
    closed = join(root, "closed");
  await writeFile(
    join(directory, "plugin.mjs"),
    `
 import {writeFileSync, appendFileSync} from 'node:fs';
 writeFileSync(${JSON.stringify(imported)},'yes');
 export function createHarnessAdapter() { appendFileSync(${JSON.stringify(created)},'created'); return {
 harnessId:'codex', close:async()=>writeFileSync(${JSON.stringify(closed)},'yes'),
 ${options.invalid ? "" : "inspect:async()=>({status:'unavailable',error:{code:'unavailable',message:'test',retryable:false}}),open:async()=>{throw Error('No execution')},"}
 }; }
 `,
  );
  const config = { home: join(root, "home"), command: process.execPath, pluginRoots: [root] };
  const create = (pluginRoots = [root]) =>
    createWebCodexHarness(
      { ...config, pluginRoots },
      {},
      "web-codex:" + "a".repeat(64),
      async () => ({
        scope: "web-codex:" + "a".repeat(64),
        revision: 0,
        values: { favorites: {} },
      }),
    );
  return { root, imported, created, closed, create };
}
it("uses explicit Web enablement without importing Codex into external scope or editing enabled.json", async () => {
  const f = await fixture();
  const before = await readFile(join(f.root, "enabled.json"), "utf8");
  const external = await loadHarnessPlugins({
    roots: [f.root],
    enabledIds: new Set(["codex"]),
    context: { environment: {}, platform: process.platform, managedRemoteHost: false },
  });
  expect(external.adapters.size).toBe(0);
  expect(existsSync(f.imported)).toBe(false);
  const web = await f.create();
  expect(existsSync(f.imported)).toBe(true);
  expect(web.harnesses.ids()).toEqual(["codex"]);
  await external.close();
  expect(existsSync(f.closed)).toBe(false);
  const anotherExternal = await loadHarnessPlugins({
    roots: [f.root],
    enabledIds: new Set(["codex"]),
    context: { environment: {}, platform: process.platform, managedRemoteHost: false },
  });
  expect(anotherExternal.adapters.size).toBe(0);
  await anotherExternal.close();
  expect(await readFile(f.created, "utf8")).toBe("created");
  expect(existsSync(f.closed)).toBe(false);
  expect((await web.harnesses.inspect("codex")).status).toBe("unavailable");
  await web.close();
  expect(existsSync(f.closed)).toBe(true);
  expect(await readFile(join(f.root, "enabled.json"), "utf8")).toBe(before);
});
it("allows the fixed Web configuration when no external enabled file exists", async () => {
  const f = await fixture();
  await rm(join(f.root, "enabled.json"));
  const web = await f.create();
  await web.close();
  expect(existsSync(join(f.root, "enabled.json"))).toBe(false);
});
it("rejects incompatible plugins before import", async () => {
  const f = await fixture({ version: 99 });
  await expect(f.create()).rejects.toThrow("incompatibleVersion");
  expect(existsSync(f.imported)).toBe(false);
});
it("rejects duplicate identities before either plugin is imported", async () => {
  const a = await fixture(),
    b = await fixture();
  await expect(a.create([a.root, b.root])).rejects.toThrow("duplicateId");
  expect(existsSync(a.imported)).toBe(false);
  expect(existsSync(b.imported)).toBe(false);
});
it("cleans up an invalid factory result through the common loader", async () => {
  const f = await fixture({ invalid: true });
  await expect(f.create()).rejects.toThrow("loadFailed");
  expect(existsSync(f.closed)).toBe(true);
});

it("rejects a missing selected plugin without creating a fallback", async () => {
  const f = await fixture();
  await rm(join(f.root, "codex"), { recursive: true, force: true });
  await expect(f.create()).rejects.toThrow("notFound");
  expect(existsSync(f.imported)).toBe(false);
});

it("rejects a usage plugin in the execution-only Web scope before import", async () => {
  const f = await fixture({ kind: "usage" });
  await expect(f.create()).rejects.toThrow("notFound");
  expect(existsSync(f.imported)).toBe(false);
});
