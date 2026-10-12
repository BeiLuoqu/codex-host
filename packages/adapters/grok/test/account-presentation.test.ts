import { describe, expect, it, vi } from "vitest";
import { GrokAdapter } from "../src/grok-adapter.js";
import type { AccountCreditsSnapshot, HarnessAccountSnapshot } from "@codexhost/shared-contracts";

describe("Grok account presentation ownership", () => {
  it("preserves product details in both account inspection and the quota cache", async () => {
    const productUsage: NonNullable<AccountCreditsSnapshot["productUsage"]> = [
      {
        product: "GrokBuild",
        usagePercent: 30,
        localizations: { en: { label: "Build" }, "zh-CN": { label: "Build" } },
      },
      { product: "GrokChat", usagePercent: 0 },
      { product: "Future product", usagePercent: 100 },
    ];
    const account: HarnessAccountSnapshot = {
      label: "native account",
      credits: { usedPercent: 25, periodType: "weekly", productUsage },
    };
    const before = structuredClone(account);
    const createTransport = vi.fn(() => {
      throw new Error("Must not open a Session");
    });
    const adapter = new GrokAdapter(
      {},
      {
        createTransport,
        randomUUID: () => "unused",
        fetchAccount: async () => account,
        fetchCredits: async () => ({
          usedPercent: 25,
          periodType: "weekly",
          fetchedAt: "2026-10-01",
          productUsage,
        }),
      },
    );
    try {
      expect(await adapter.inspectAccount()).toEqual(before);
      expect(account).toEqual(before);
      await adapter.refreshCredits();
      expect(adapter.credits()?.productUsage).toEqual(before.credits?.productUsage);
      expect(createTransport).not.toHaveBeenCalled();
    } finally {
      await adapter.close();
    }
  });
});
