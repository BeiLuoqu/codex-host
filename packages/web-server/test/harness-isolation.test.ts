import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it, type TestContext } from "node:test";
import { HarnessRegistry } from "../src/harnesses.ts";

async function root(t: TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "web-harness-isolation-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function plugin(
  root: string,
  id: string,
  options: { entry?: string; usage?: boolean } = {},
): Promise<string> {
  const directory = path.join(root, id);
  await mkdir(directory);
  await writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify({
      manifestVersion: 1,
      id,
      name: id,
      version: "1.0.0",
      adapterApiVersion: 1,
      entry: options.entry ?? "plugin.mjs",
      ...(options.usage ? { kind: "usage" } : {}),
    }),
  );
  await writeFile(
    path.join(directory, "plugin.mjs"),
    'import { writeFileSync } from "node:fs"; writeFileSync(new URL("executed", import.meta.url), "yes"); throw new Error("Web must not import plugins");',
  );
  return directory;
}

for (const configuration of ["default", "enabled", "external"] as const) {
  it(`reads only metadata in the ${configuration} external registry`, async (t) => {
    const directory = await root(t);
    const codex = await plugin(directory, "codex");
    const external = await plugin(directory, "fake-agent");
    const usage = await plugin(directory, "codex-usage", { usage: true });
    const registry = new HarnessRegistry(
      [directory],
      configuration === "default" ? undefined : new Set(["codex", "fake-agent", "codex-usage"]),
      configuration === "external" ? { scope: "external" } : {},
    );
    assert.deepEqual(registry.ids(), ["fake-agent"]);
    assert.equal(registry.manifest("codex"), undefined);
    assert.equal("adapter" in registry, false);
    for (const entry of [codex, external, usage])
      assert.equal(existsSync(path.join(entry, "executed")), false);
  });
}

it("requires explicit Codex enablement in the Web scope", async (t) => {
  const directory = await root(t);
  const codex = await plugin(directory, "codex");
  await plugin(directory, "fake-agent");
  for (const enabled of [undefined, new Set<string>(), new Set(["fake-agent"])]) {
    const registry = new HarnessRegistry([directory], enabled, { scope: "web-codex" });
    assert.deepEqual(registry.ids(), []);
  }
  assert.equal(existsSync(path.join(codex, "executed")), false);
});

it("reads Codex metadata without constructing an Adapter in the gateway", async (t) => {
  const directory = await root(t);
  const codex = await plugin(directory, "codex");
  const external = await plugin(directory, "fake-agent");
  const registry = new HarnessRegistry([directory], new Set(["codex", "fake-agent"]), {
    scope: "web-codex",
  });
  assert.deepEqual(registry.ids(), ["codex"]);
  assert.equal(registry.manifest("codex")?.name, "codex");
  assert.equal(existsSync(path.join(codex, "executed")), false);
  assert.equal(existsSync(path.join(external, "executed")), false);
});

it("rejects duplicate enabled identities before either module is imported", async (t) => {
  const firstRoot = await root(t);
  const secondRoot = await root(t);
  const first = await plugin(firstRoot, "codex");
  const second = await plugin(secondRoot, "codex");
  assert.throws(
    () => new HarnessRegistry([firstRoot, secondRoot], new Set(["codex"]), { scope: "web-codex" }),
    /Duplicate Harness plugin: codex/u,
  );
  assert.equal(existsSync(path.join(first, "executed")), false);
  assert.equal(existsSync(path.join(second, "executed")), false);
});

it("rejects a parent-relative entry", async (t) => {
  const directory = await root(t);
  const codex = await plugin(directory, "codex", { entry: "../escape.mjs" });
  assert.throws(() => new HarnessRegistry([directory], new Set(["codex"]), { scope: "web-codex" }));
  assert.equal(existsSync(path.join(codex, "executed")), false);
});
