/**
 * Attachment context Codex Desktop serializes ahead of the user's request:
 *
 * ```text
 * # Files mentioned by the user:
 *
 * ## shot.png: /absolute/path/shot.png
 * Image attachment: true
 *
 * ## My request:
 * …
 * ```
 *
 * A Harness receives a turn's images only as these paths, so the Host reads them back from the
 * same text. Paths the user typed into the request are never attachments.
 */
const ATTACHED_FILES_HEADING = "# Files mentioned by the user:";
const REQUEST_HEADING = "## My request:";
const IMAGE_ATTACHMENT_PATTERN =
  /(?:^|\n)## [^\r\n]+: ((?:\/|[A-Za-z]:[\\/]|\\\\)[^\r\n]+)\r?\nImage attachment: true(?=\r?\n|$)/gu;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

/** Absolute image paths in the attachment context Desktop serialized into a prompt. */
export function desktopImageAttachmentPaths(text: string): string[] {
  const context = text.split(REQUEST_HEADING)[0] ?? "";
  const start = context.indexOf(ATTACHED_FILES_HEADING);
  if (start < 0) return [];
  return [...context.slice(start).matchAll(IMAGE_ATTACHMENT_PATTERN)]
    .map((match) => match[1] ?? "")
    .filter((path) => path.length > 0 && !CONTROL_CHARACTER_PATTERN.test(path));
}
