import type { JsonObject } from "@codexhost/protocol-core";

/** Only the first user message counts, including textless inputs. Undefined means
 * no user message is available yet, not permission to borrow a later prompt.
 * Bound the stored presentation hint; it is never a replacement for native history.
 */
export function firstUserMessagePreview(turns: readonly JsonObject[]): string | undefined {
  for (const turn of turns) {
    if (!Array.isArray(turn.items)) continue;
    for (const item of turn.items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      if (item.type !== "userMessage") continue;
      const text = (Array.isArray(item.content) ? item.content : [])
        .flatMap((part) =>
          part &&
          typeof part === "object" &&
          !Array.isArray(part) &&
          part.type === "text" &&
          typeof part.text === "string"
            ? [part.text]
            : [],
        )
        .join(" ")
        .replace(/\s+/gu, " ")
        .trim();
      return Array.from(text).slice(0, 1024).join("");
    }
  }
  return undefined;
}
