import { createHash } from "node:crypto";
import { copyFileSync, existsSync, linkSync, mkdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MEDIA_EXTENSIONS = new Set([
  ".aac",
  ".gif",
  ".jpeg",
  ".jpg",
  ".m4a",
  ".m4v",
  ".mov",
  ".mp3",
  ".mp4",
  ".ogg",
  ".png",
  ".svg",
  ".wav",
  ".webm",
  ".webp",
]);

/** Whether an absolute candidate path is a media file Codex Desktop can load. */
export type LocalMediaExists = (absolutePath: string) => boolean;

/** The path a Markdown destination should name for a resolved local media file. */
export type LocalMediaLinkPath = (absolutePath: string) => string;

export interface RewriteLocalMediaMarkdownOptions {
  exists?: LocalMediaExists;
  /** Defaults to {@link linkableLocalMediaPath}. */
  linkPath?: LocalMediaLinkPath;
  /**
   * Hold back a trailing construct that later text could still complete or invalidate
   * (an open image or inline code span), so a growing text projects prefix-stably.
   */
  holdIncomplete?: boolean;
}

/**
 * Codex Desktop loads a Markdown image from local disk only when its destination is an absolute
 * path or `file:` URL; it resolves any other destination against its own page. Rewrite local
 * media in image destinations, and inline code holding only a media path, to absolute paths
 * found under `roots` in order. Remote URLs, missing files, and fenced code stay unchanged.
 */
export function rewriteLocalMediaMarkdown(
  text: string,
  roots: readonly string[],
  options: RewriteLocalMediaMarkdownOptions = {},
): string {
  return projectLocalMedia(
    text,
    roots,
    options.exists ?? mediaFileExists,
    options.holdIncomplete === true,
    options.linkPath ?? linkableLocalMediaPath,
  ).text;
}

/**
 * Streams native agent text through {@link rewriteLocalMediaMarkdown} as append-only deltas.
 * Published text never changes: a trailing construct waits until later text decides it, `flush`
 * releases it, and each file check is remembered so one message resolves a path one way.
 */
export class LocalMediaMarkdownStream {
  readonly #roots: readonly string[];
  readonly #exists: LocalMediaExists;
  readonly #linkPath: LocalMediaLinkPath;
  #native = "";
  #text = "";
  /** Native text length represented by `#text`; the rest is held. */
  #consumed = 0;
  #verbatim = false;

  constructor(
    roots: readonly string[],
    exists: LocalMediaExists = mediaFileExists,
    linkPath: LocalMediaLinkPath = linkableLocalMediaPath,
  ) {
    this.#roots = [...roots];
    const linked = new Map<string, string>();
    this.#linkPath = (absolutePath) => {
      let link = linked.get(absolutePath);
      if (link === undefined) {
        link = linkPath(absolutePath);
        linked.set(absolutePath, link);
      }
      return link;
    };
    const known = new Map<string, boolean>();
    this.#exists = (absolutePath) => {
      let found = known.get(absolutePath);
      if (found === undefined) {
        found = exists(absolutePath);
        known.set(absolutePath, found);
      }
      return found;
    };
  }

  /** Projected text published so far: every returned delta, concatenated. */
  get text(): string {
    return this.#text;
  }

  /** Add native text and return the projected text it makes publishable, possibly empty. */
  append(text: string): string {
    this.#native += text;
    return this.#advance(true);
  }

  /** Return the projected text still held at the end of the stream. */
  flush(): string {
    return this.#advance(false);
  }

  #advance(holdIncomplete: boolean): string {
    const next = this.#verbatim
      ? undefined
      : projectLocalMedia(this.#native, this.#roots, this.#exists, holdIncomplete, this.#linkPath);
    let delta: string;
    if (next?.text.startsWith(this.#text)) {
      delta = next.text.slice(this.#text.length);
      this.#consumed = next.consumed;
    } else {
      // Published text cannot be retracted, so continue with the native text verbatim.
      this.#verbatim = true;
      delta = this.#native.slice(this.#consumed);
      this.#consumed = this.#native.length;
    }
    this.#text += delta;
    return delta;
  }
}

interface LocalMediaProjection {
  readonly text: string;
  /** Length of the native text the projection covers. */
  readonly consumed: number;
}

function projectLocalMedia(
  text: string,
  roots: readonly string[],
  exists: LocalMediaExists,
  holdIncomplete: boolean,
  linkPath: LocalMediaLinkPath,
): LocalMediaProjection {
  let output = "";
  let index = 0;
  let fence = false;
  while (index < text.length) {
    if (fence) {
      const fenceEnd = text.indexOf("```", index);
      if (fenceEnd === -1) break;
      output += text.slice(index, fenceEnd + 3);
      index = fenceEnd + 3;
      fence = false;
      continue;
    }
    const next = earliestIndex([
      text.indexOf("```", index),
      text.indexOf("![", index),
      indexOfInlineTick(text, index),
    ]);
    if (next === -1) break;
    output += text.slice(index, next);
    index = next;
    if (text.startsWith("```", next)) {
      output += "```";
      index += 3;
      fence = true;
      continue;
    }
    if (text.startsWith("![", next)) {
      const image = parseMarkdownImage(text, next);
      if (image.kind === "text") {
        output += text.slice(next, image.end);
        index = image.end;
        continue;
      }
      if (image.kind === "open") {
        if (!holdIncomplete) break;
        return { text: output + text.slice(next, image.holdFrom), consumed: image.holdFrom };
      }
      const resolved = resolveLocalMediaPath(image.destination, roots, exists);
      output +=
        resolved === null
          ? text.slice(next, image.end)
          : text.slice(next, image.destinationStart) +
            markdownDestination(linkPath(resolved), image.bracketed) +
            text.slice(image.destinationEnd, image.end);
      index = image.end;
      continue;
    }
    const code = parseInlineCode(text, next);
    if (code.kind === "text") {
      output += "`";
      index = next + 1;
      continue;
    }
    if (code.kind === "open") {
      if (!holdIncomplete) break;
      return { text: output, consumed: next };
    }
    const resolved = resolveLocalMediaPath(code.content, roots, exists);
    output +=
      resolved === null
        ? text.slice(next, code.end)
        : mediaMarkdownImage(resolved, linkPath(resolved));
    index = code.end;
  }
  return { text: output + text.slice(index), consumed: text.length };
}

function indexOfInlineTick(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    const tick = text.indexOf("`", index);
    if (tick === -1) return -1;
    if (text.startsWith("```", tick)) {
      index = tick + 3;
      continue;
    }
    return tick;
  }
  return -1;
}

function earliestIndex(candidates: readonly number[]): number {
  let next = -1;
  for (const candidate of candidates) {
    if (candidate === -1) continue;
    if (next === -1 || candidate < next) next = candidate;
  }
  return next;
}

/** `text`: ordinary text through `end`. `open`: the text ends before the construct is decided. */
type ParsedInlineCode =
  { kind: "code"; content: string; end: number } | { kind: "open" } | { kind: "text" };

function parseInlineCode(text: string, start: number): ParsedInlineCode {
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index];
    // A path never spans lines, so leave the tick as text rather than hold everything after it.
    if (character === "\n") return { kind: "text" };
    if (character === "`") {
      return { kind: "code", content: text.slice(start + 1, index), end: index + 1 };
    }
  }
  return { kind: "open" };
}

type ParsedMarkdownImage =
  | {
      kind: "image";
      destination: string;
      destinationStart: number;
      destinationEnd: number;
      end: number;
      bracketed: boolean;
    }
  /** Published text may end at `holdFrom`; only later text can decide the rest. */
  | { kind: "open"; holdFrom: number }
  | { kind: "text"; end: number };

function parseMarkdownImage(text: string, start: number): ParsedMarkdownImage {
  // Until the label closes, only `![` is settled: `!` was publishable before `[` arrived.
  const openLabel = { kind: "open", holdFrom: start + 2 } as const;
  let index = start + 2;
  while (index < text.length) {
    const character = text[index];
    if (character === "\n") return { kind: "text", end: start + 1 };
    if (character === "\\") {
      index += 2;
      continue;
    }
    if (character === "]") break;
    index += 1;
  }
  if (index + 1 >= text.length) return openLabel;
  if (text[index + 1] !== "(") return { kind: "text", end: start + 1 };
  const destinationStart = index + 2;
  // From here `![label](` is settled; a malformed rest leaves it, and the label, as text.
  const open = { kind: "open", holdFrom: destinationStart } as const;
  const malformed = { kind: "text", end: destinationStart } as const;
  index = skipBlanks(text, destinationStart);
  if (index >= text.length) return open;
  let destination: string;
  let destinationEnd: number;
  let bracketed = false;
  if (text[index] === "<") {
    bracketed = true;
    let close = index + 1;
    while (close < text.length && text[close] !== ">" && text[close] !== "\n") close += 1;
    if (close >= text.length) return open;
    if (text[close] === "\n") return malformed;
    destination = text.slice(index + 1, close);
    destinationEnd = close + 1;
    index = destinationEnd;
  } else {
    const begin = index;
    while (index < text.length) {
      const character = text[index];
      if (character === "\n" || character === " " || character === "\t" || character === ")") break;
      index += character === "\\" ? 2 : 1;
    }
    if (index >= text.length) return open;
    destination = unescapeMarkdown(text.slice(begin, index));
    destinationEnd = index;
  }
  index = skipBlanks(text, index);
  if (index >= text.length) return open;
  const opener = text[index];
  if (opener === '"' || opener === "'" || opener === "(") {
    const closer = opener === "(" ? ")" : opener;
    index += 1;
    while (index < text.length && text[index] !== closer && text[index] !== "\n") index += 1;
    if (index >= text.length) return open;
    if (text[index] === "\n") return malformed;
    index = skipBlanks(text, index + 1);
    if (index >= text.length) return open;
  }
  if (text[index] !== ")") return malformed;
  return {
    kind: "image",
    destination,
    destinationStart,
    destinationEnd,
    end: index + 1,
    bracketed,
  };
}

function skipBlanks(text: string, start: number): number {
  let index = start;
  while (text[index] === " " || text[index] === "\t") index += 1;
  return index;
}

function mediaMarkdownImage(absolutePath: string, link: string): string {
  const name = path.basename(absolutePath).replaceAll("]", "\\]");
  return `![${name}](${markdownDestination(link, false)})`;
}

/**
 * Codex Desktop percent-decodes a local media destination twice before reading the file, so no
 * single escaping keeps a literal `%` intact; Grok's session directories are the cwd encoded
 * with encodeURIComponent and always contain one. Such a file is hard-linked (or copied) to a
 * `%`-free alias under `<data directory>/media-links` and the alias is linked instead; if that
 * fails, the path is escaped for exactly two decodes. Other paths are returned unchanged.
 */
export function linkableLocalMediaPath(
  absolutePath: string,
  aliasRoot: string = defaultMediaAliasRoot(),
): string {
  if (!absolutePath.includes("%")) return absolutePath;
  return mediaAlias(absolutePath, aliasRoot) ?? absolutePath.replaceAll("%", "%2525");
}

function defaultMediaAliasRoot(): string {
  const dataDirectory = process.env.CODEXHOST_DATA_DIR;
  return path.join(
    dataDirectory ? path.resolve(dataDirectory) : path.join(os.homedir(), ".codexhost"),
    "media-links",
  );
}

function mediaAlias(absolutePath: string, aliasRoot: string): string | null {
  try {
    const digest = createHash("sha256").update(absolutePath).digest("hex").slice(0, 16);
    const directory = path.join(aliasRoot, digest);
    const alias = path.join(directory, path.basename(absolutePath).replaceAll("%", "_"));
    if (alias.includes("%")) return null;
    const source = statSync(absolutePath);
    if (!source.isFile()) return null;
    if (existsSync(alias)) {
      const current = statSync(alias);
      // A hard link shares the source's inode; a copy is current when it is at least as new.
      if (current.size === source.size && current.mtimeMs >= source.mtimeMs) return alias;
      rmSync(alias, { force: true });
    }
    mkdirSync(directory, { recursive: true });
    try {
      linkSync(absolutePath, alias);
    } catch {
      copyFileSync(absolutePath, alias);
    }
    return alias;
  } catch {
    return null;
  }
}

function markdownDestination(absolutePath: string, bracketed: boolean): string {
  // CommonMark drops a backslash before punctuation (`C:\Users\me\.codex`), and Codex reads
  // `C:/…` as absolute; other paths keep their backslashes escaped.
  const destination = /^[A-Za-z]:\\/.test(absolutePath)
    ? absolutePath.replaceAll("\\", "/")
    : absolutePath.replaceAll("\\", "\\\\");
  return bracketed || /[\s()]/.test(destination) ? `<${destination}>` : destination;
}

function unescapeMarkdown(value: string): string {
  return value.replace(/\\([\\()])/g, "$1");
}

/** Resolve a media reference to an existing absolute file, trying relative paths under `roots`. */
export function resolveLocalMediaPath(
  raw: string,
  roots: readonly string[],
  exists: LocalMediaExists = mediaFileExists,
): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || isRemoteMediaUrl(trimmed)) return null;
  const stripped = stripFileUrl(trimmed);
  if (stripped === null || !hasMediaExtension(stripped)) return null;
  if (isAbsoluteMediaPath(stripped)) {
    const absolute = path.resolve(stripped);
    return exists(absolute) ? absolute : null;
  }
  for (const root of roots) {
    const absolute = path.resolve(root, stripped);
    if (exists(absolute)) return absolute;
  }
  return null;
}

function isRemoteMediaUrl(value: string): boolean {
  return /^(?:https?:|data:|app:|blob:)/i.test(value);
}

function stripFileUrl(value: string): string | null {
  if (!value.toLowerCase().startsWith("file:")) return value;
  try {
    return fileURLToPath(value);
  } catch {
    return null;
  }
}

function isAbsoluteMediaPath(value: string): boolean {
  return path.isAbsolute(value) || /^[a-zA-Z]:[\\/]/.test(value);
}

function hasMediaExtension(value: string): boolean {
  const pathname = value.split(/[?#]/, 1)[0] ?? value;
  return MEDIA_EXTENSIONS.has(path.extname(pathname).toLowerCase());
}

function mediaFileExists(absolutePath: string): boolean {
  try {
    return existsSync(absolutePath) && statSync(absolutePath).isFile();
  } catch {
    return false;
  }
}
