import type { ThreadUsageInspection } from "@codexhost/shared-contracts";

import type { SessionLog } from "./session-log.ts";

/** Project one validated Host snapshot into the generic DSH meters and CH detail surface. */
export function applyUsageProjections(log: SessionLog, value: ThreadUsageInspection): void {
  const { usage, accountCredits } = value;
  log.setProjection(
    "codexhostUsage",
    usage !== null || accountCredits !== undefined
      ? { usage, ...(accountCredits === undefined ? {} : { accountCredits }) }
      : null,
  );

  const input = usage?.inputTokens ?? 0;
  const cacheRead = usage?.cachedInputTokens ?? 0;
  const cacheWrite = usage?.cacheWriteInputTokens ?? 0;
  log.setProjection("tokenUsage", {
    // Host input includes both cache buckets. Clamp malformed cross-field native
    // totals rather than presenting a negative uncached count.
    uncachedInputTokens: Math.max(input - cacheRead - cacheWrite, 0),
    outputTokens: usage?.outputTokens ?? 0,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
  });

  log.setProjection(
    "contextPressure",
    usage?.contextUsedTokens !== undefined && usage.contextWindowTokens !== undefined
      ? {
          pressureTokens: usage.contextUsedTokens,
          projectedTokens: usage.contextUsedTokens,
          contextWindow: usage.contextWindowTokens,
        }
      : {},
  );
}
