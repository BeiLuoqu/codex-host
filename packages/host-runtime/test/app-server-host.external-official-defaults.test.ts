import type { JsonObject } from "@codexhost/protocol-core";
import { describe, expect, it, vi } from "vitest";

import {
  JsonLineCollector,
  completePiTurn,
  createFixture,
  requestId,
  startPiThread,
  stopFixture,
  writeRequest,
} from "./app-server-host-fixture.js";

describe("External Thread official per-Thread defaults", () => {
  it("answers official list and settings requests with empty results instead of errors", async () => {
    const fixture = createFixture();
    const official = new JsonLineCollector(fixture.official.stdin);
    const threadId = await startPiThread(fixture);
    const session = fixture.adapter.sessions[0];
    if (!session) throw new Error("External Session was not opened");
    const execute = vi.spyOn(session, "execute");

    const requests = [
      { id: 40, method: "thread/attachment/list", params: { threadId, limit: 100 } },
      { id: 41, method: "thread/queue/list", params: { threadId, limit: 100 } },
      {
        id: 42,
        method: "thread/settings/update",
        params: {
          threadId,
          approvalPolicy: "never",
          approvalsReviewer: "user",
          sandboxPolicy: { type: "dangerFullAccess" },
        },
      },
      { id: 43, method: "thread/future/manage", params: { threadId } },
    ];
    for (const request of requests) writeRequest(fixture.desktopInput, request);

    await expect(
      fixture.collector.waitFor((message) => requestId(message, 40)),
    ).resolves.toMatchObject({ result: { data: [], nextCursor: null } });
    await expect(
      fixture.collector.waitFor((message) => requestId(message, 41)),
    ).resolves.toMatchObject({ result: { data: [], nextCursor: null } });
    const settings = await fixture.collector.waitFor((message) => requestId(message, 42));
    expect(settings.result).toEqual({});
    expect(settings.error).toBeUndefined();
    await expect(
      fixture.collector.waitFor((message) => requestId(message, 43)),
    ).resolves.toMatchObject({
      error: { code: -32076, message: "External Thread does not support thread/future/manage" },
    });

    const handled = new Set(requests.map((request) => request.method));
    expect(official.messages.some((message) => handled.has(String(message.method)))).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    await completePiTurn(fixture, threadId, 44);
    await stopFixture(fixture);
  });

  it.each<JsonObject>([
    { approvalPolicy: "on-request" },
    { approvalsReviewer: "auto_review" },
    { sandboxPolicy: { type: "readOnly" } },
    { sandboxPolicy: { type: "workspaceWrite", writableRoots: [] } },
    { sandboxPolicy: { type: "dangerFullAccess", extraRestriction: true } },
    { model: "other-model" },
    { cwd: "/different-workspace" },
    { effort: "low" },
    { serviceTier: null },
    { futureSetting: true },
  ])("rejects settings that are not neutral client defaults: %j", async (settings) => {
    const fixture = createFixture();
    const official = new JsonLineCollector(fixture.official.stdin);
    try {
      const threadId = await startPiThread(fixture);
      const session = fixture.adapter.sessions[0];
      if (!session) throw new Error("External Session was not opened");
      const execute = vi.spyOn(session, "execute");
      writeRequest(fixture.desktopInput, {
        id: 40,
        method: "thread/settings/update",
        params: { threadId, ...settings },
      });
      await expect(
        fixture.collector.waitFor((message) => requestId(message, 40)),
      ).resolves.toMatchObject({ error: { code: -32076 } });
      expect(execute).not.toHaveBeenCalled();
      expect(official.messages.some((message) => message.method === "thread/settings/update")).toBe(
        false,
      );
    } finally {
      await stopFixture(fixture);
    }
  });

  it.each<JsonObject>([{}, { approvalPolicy: null, approvalsReviewer: null, sandboxPolicy: null }])(
    "accepts settings requests that leave all defaults unchanged: %j",
    async (settings) => {
      const fixture = createFixture();
      try {
        const threadId = await startPiThread(fixture);
        writeRequest(fixture.desktopInput, {
          id: 40,
          method: "thread/settings/update",
          params: { threadId, ...settings },
        });
        await expect(
          fixture.collector.waitFor((message) => requestId(message, 40)),
        ).resolves.toMatchObject({ result: {} });
      } finally {
        await stopFixture(fixture);
      }
    },
  );
});
