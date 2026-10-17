import type { JsonObject } from "@codexhost/protocol-core";

/**
 * Official per-Thread requests that clients without the codexhost renderer (such as the ChatGPT
 * iOS app over SSH) send around every open or send. External Threads have no official
 * attachments or queued submissions, and their permissions belong to the Harness, so these answer
 * with the empty official response shape rather than an error that aborts the client's flow.
 * Settings acknowledgements accept only neutral Codex client defaults. Native Harness
 * permissions stay authoritative; actual settings changes remain unsupported.
 */
const EMPTY_RESULTS: ReadonlyMap<string, () => JsonObject> = new Map([
  ["thread/attachment/list", () => ({ data: [], nextCursor: null })],
  ["thread/queue/list", () => ({ data: [], nextCursor: null })],
  ["thread/settings/update", () => ({})],
]);

function isNeutralClientSettings(params: JsonObject): boolean {
  return Object.entries(params).every(([key, value]) => {
    switch (key) {
      case "threadId":
        return true;
      case "approvalPolicy":
        return value === null || value === "never";
      case "approvalsReviewer":
        return value === null || value === "user";
      case "sandboxPolicy":
        return (
          value === null ||
          (typeof value === "object" &&
            !Array.isArray(value) &&
            value.type === "dangerFullAccess" &&
            Object.keys(value).length === 1)
        );
      default:
        return false;
    }
  });
}

export function externalThreadEmptyOfficialResult(
  method: string,
  params: JsonObject,
): JsonObject | undefined {
  if (method === "thread/settings/update" && !isNeutralClientSettings(params)) return undefined;
  return EMPTY_RESULTS.get(method)?.();
}
