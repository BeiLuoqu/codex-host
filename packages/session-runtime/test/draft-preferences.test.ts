import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { harnessInspectionSchema } from "@codexhost/shared-contracts";
import { IsolatedSessions, SessionFileStore, type SessionHarnesses } from "../src/index.js";

it.each(["pi", "codex"])(
  "saves %s draft defaults without requiring optional configuration",
  async (id) => {
    const root = mkdtempSync(join(tmpdir(), "draft-preferences-"));
    const remember = vi.fn(async () => {});
    const adapter = vi.fn(async () => {
      throw Error("Draft configuration must not open native execution");
    });
    const inspection = harnessInspectionSchema.parse({
      status: "ready",
      catalog: { models: [{ ref: { id: "model" }, label: "Model" }], thinkingOptions: [] },
      capabilities: {
        configuration: {
          selectModel: true,
          selectThinkingOption: false,
          selectPermissionMode: id === "codex",
        },
        history: { fork: false, forkAcrossCwd: false, rollbackLastTurn: false },
      },
      ...(id === "codex"
        ? {
            permissionModes: {
              modes: [{ id: "read-only", label: "Read only" }],
              defaultModeId: "read-only",
            },
          }
        : {}),
    });
    const harnesses: SessionHarnesses = {
      ids: () => [id],
      manifest: () => ({ name: id }),
      preferredSelection: undefined,
      inspect: async () => inspection,
      adapter,
      modelCatalog: async () => ({
        default: { provider: id, model: "model" },
        groups: [{ id, models: [{ id: "model" }] }],
        routableProviders: [id],
        failures: [],
      }),
      preferences: { configuration: async () => undefined, remember },
    };
    const owner = new IsolatedSessions(
      new SessionFileStore(root),
      harnesses,
      { get: () => undefined, ownerOf: () => undefined, attachSession() {} },
      {
        changed() {},
        interaction() {
          throw Error("No interaction in a draft");
        },
      },
    );
    try {
      const { sessionId } = await owner.create({ cwd: root });
      await owner.selectModel({ sessionId, provider: id, model: "model" });
      expect(remember).toHaveBeenLastCalledWith(id, {
        model: { id: "model" },
        thinkingOptionId: undefined,
        permissionModeId: undefined,
      });
      if (id === "codex") {
        expect(
          await owner.commandsExecute({ agentId: sessionId, line: "/permission read-only" }),
        ).toMatchObject({ result: { kind: "success" } });
        expect(remember).toHaveBeenLastCalledWith(id, {
          model: { id: "model" },
          thinkingOptionId: undefined,
          permissionModeId: "read-only",
        });
      }
      expect(adapter).not.toHaveBeenCalled();
    } finally {
      await owner.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
