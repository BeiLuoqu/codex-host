import { mkdtemp, readdir, appendFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { UsageMeasurementsStore } from "../src/usage-measurements-store.js";

it("restores latest retained facts despite append ordering, malformed tails and other homes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "usage-measurements-"));
  const store = new UsageMeasurementsStore(directory, () => {});
  try {
    store.record("scope", "session", "latest", 300, { outputTokensPerSecond: 30 });
    store.record("scope", "session", "earlier", 100, {
      outputTokensPerSecond: 10,
      timeToFirstOutputMs: 40,
    });
    store.record("scope", "session", "latest", 200, { outputTokensPerSecond: 20 });
    await store.close();
    const [file] = await readdir(join(directory, "usage-measurements-v1"));
    if (!file) throw new Error("Missing measurements");
    await appendFile(
      join(directory, "usage-measurements-v1", file),
      'broken\n{"version":1,"turnId":"latest","at":999,"values":{"outputTokensPerSecond":-5}}\n',
    );
    expect(await store.read("scope", "session", new Set(["latest", "earlier"]))).toMatchObject({
      outputTokensPerSecond: { value: 30 },
      timeToFirstOutputMs: { value: 40 },
    });
    expect(await store.read("scope", "session", new Set(["earlier"]))).toMatchObject({
      outputTokensPerSecond: { value: 10 },
    });
    expect(await store.read("other-home", "session", new Set(["latest"]))).toEqual({});
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it("reports cache write failure without rejecting native observation or shutdown", async () => {
  const directory = await mkdtemp(join(tmpdir(), "usage-measurements-failure-"));
  const diagnose = vi.fn();
  const store = new UsageMeasurementsStore(directory, diagnose);
  try {
    await writeFile(join(directory, "usage-measurements-v1"), "occupied");
    expect(() =>
      store.record("scope", "session", "turn", 100, { outputTokensPerSecond: 20 }),
    ).not.toThrow();
    await expect(store.close()).resolves.toBeUndefined();
    expect(diagnose).toHaveBeenCalledOnce();
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
