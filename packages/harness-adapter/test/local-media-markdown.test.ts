import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  LocalMediaMarkdownStream,
  resolveLocalMediaPath,
  rewriteLocalMediaMarkdown,
} from "../src/local-media-markdown.js";

const workspace = path.resolve("test-fixtures/media-workspace");
const files = new Set(
  [
    "shot.png",
    "a.png",
    "x.png",
    "sub/b.png",
    "dir with space/c.png",
    ".codex/d.png",
    "截图/e.png",
  ].map((file) => path.join(workspace, file)),
);
const exists = (absolutePath: string) => files.has(path.resolve(absolutePath));
const roots = [workspace];
/** Markdown spelling of an absolute path: Windows drive paths use forward slashes. */
const md = (absolutePath: string) => absolutePath.replaceAll("\\", "/");
const at = (file: string) => md(path.join(workspace, file));
const rewrite = (text: string, holdIncomplete = false) =>
  rewriteLocalMediaMarkdown(text, roots, { exists, holdIncomplete });

describe("rewriteLocalMediaMarkdown", () => {
  it("makes relative image destinations absolute", () => {
    expect(rewrite("![shot](shot.png)\n![b](./sub/b.png)")).toBe(
      `![shot](${at("shot.png")})\n![b](${at("sub/b.png")})`,
    );
  });

  it("keeps non-ASCII paths and brackets paths with spaces", () => {
    expect(rewrite('![e](截图/e.png) ![c](<dir with space/c.png> "title")')).toBe(
      `![e](${at("截图/e.png")}) ![c](<${at("dir with space/c.png")}> "title")`,
    );
  });

  it("writes Windows paths so Markdown escapes cannot drop a separator", () => {
    const rewritten = rewrite("![d](.codex/d.png)");
    expect(rewritten).toBe(`![d](${at(".codex/d.png")})`);
    expect(rewritten).not.toMatch(/\\[!-/:-@[-`{-~]/u);
  });

  it("resolves file URLs and absolute paths", () => {
    const absolute = path.join(workspace, "a.png");
    expect(rewrite(`![a](${pathToFileURL(absolute).href}) and \`${absolute}\``)).toBe(
      `![a](${at("a.png")}) and ![a.png](${at("a.png")})`,
    );
  });

  it("leaves remote, missing, and unparsed references byte-for-byte unchanged", () => {
    const text = [
      "![remote](https://example.com/a.png)",
      "![missing](missing.png)",
      "![escaped](missing\\(1\\).png)",
      "`npm test` and `a.txt`",
      "```md\n![a](a.png)\n`a.png`\n```",
    ].join("\n");
    expect(rewrite(text)).toBe(text);
  });

  it("does not let a malformed image or stray backtick stop later rewrites", () => {
    expect(rewrite("![a](a.png bad) then `\nand ![x](x.png)")).toBe(
      `![a](a.png bad) then \`\nand ![x](${at("x.png")})`,
    );
  });

  it("holds only a trailing construct that later text could still change", () => {
    expect(rewrite("see ![a](a.p", true)).toBe("see ![a](");
    expect(rewrite("see `a.p", true)).toBe("see ");
    expect(rewrite("see ![a", true)).toBe("see ![");
    expect(rewrite("![a](a.png bad) then ` stray\nmore", true)).toBe(
      "![a](a.png bad) then ` stray\nmore",
    );
  });

  it("resolves relative paths against roots in order", () => {
    const first = path.join(workspace, "sub");
    expect(resolveLocalMediaPath("b.png", [first, workspace], exists)).toBe(
      path.join(first, "b.png"),
    );
    expect(resolveLocalMediaPath("notes.txt", roots, () => true)).toBeNull();
  });
});

describe("LocalMediaMarkdownStream", () => {
  const samples = [
    'see `a.png` and ![b](sub/b.png "t") then ![c](missing.png)',
    "![a`x.png`](a.png) and `x.png`",
    "```md\n![a](a.png)\n```\nafter `a.png`",
    "x ` y\n![a](a.png)",
    "![a](a.png bad) then ![b](sub/b.png)",
    "![a]\n![c](<dir with space/c.png>)",
    "a!![b](sub/b.png)!",
    "``a.png`` and `a.png`` and ```",
    "![e](截图/e.png)。",
  ];

  function streamed(text: string, cuts: readonly number[]): { deltas: string[]; text: string } {
    const stream = new LocalMediaMarkdownStream(roots, exists);
    const deltas: string[] = [];
    let start = 0;
    for (const end of [...cuts, text.length]) {
      deltas.push(stream.append(text.slice(start, end)));
      start = end;
    }
    deltas.push(stream.flush());
    expect(stream.text).toBe(deltas.join(""));
    return { deltas, text: stream.text };
  }

  it("publishes the same text as a one-shot rewrite for every split", () => {
    for (const sample of samples) {
      const expected = rewrite(sample);
      for (let first = 0; first <= sample.length; first += 1) {
        for (let second = first; second <= sample.length; second += 1) {
          expect(streamed(sample, [first, second]).text, `${sample} @${first},${second}`).toBe(
            expected,
          );
        }
      }
      const characters = Array.from({ length: sample.length }, (_, index) => index);
      expect(streamed(sample, characters).text).toBe(expected);
    }
  });

  it("does not hold settled text while the stream is open", () => {
    const stream = new LocalMediaMarkdownStream(roots, exists);
    expect(stream.append("x ` stray\nthen ![a](a.png) and ![b](sub/")).toBe(
      `x \` stray\nthen ![a](${at("a.png")}) and ![b](`,
    );
    expect(stream.append("b.png)")).toBe(`${at("sub/b.png")})`);
    expect(stream.flush()).toBe("");
  });

  it("checks each path once for the lifetime of a stream", () => {
    const check = vi.fn(exists);
    const stream = new LocalMediaMarkdownStream(roots, check);
    stream.append("![a](a.png) ");
    stream.append("more ");
    stream.append("text");
    stream.flush();
    expect(check).toHaveBeenCalledTimes(1);
  });
});
