import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve, relative } from "node:path";
import type { SessionDataStore } from "./contracts.js";

export function canonicalSessionPath(value: string): string {
  const absolute = resolve(value);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = dirname(absolute);
  return parent === absolute
    ? absolute
    : join(canonicalSessionPath(parent), relative(parent, absolute));
}

/** Session journals and configuration under the shared Host's isolated source. */
export class SessionFileStore implements SessionDataStore {
  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true });
  }
  path(...parts: string[]): string {
    const target = resolve(this.root, ...parts);
    const local = relative(this.root, target);
    if (
      local === ".." ||
      local.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
      isAbsolute(local)
    )
      throw new Error("source-path-invalid");
    return target;
  }
  readJson<T>(file: string, fallback: T): T {
    const target = this.path(file);
    return existsSync(target) ? (JSON.parse(readFileSync(target, "utf8")) as T) : fallback;
  }
  readLines<T>(file: string): T[] {
    const target = this.path(file);
    if (!existsSync(target)) return [];
    return readFileSync(target, "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as T);
  }
  writeJson(file: string, value: unknown): void {
    const target = this.path(file);
    mkdirSync(dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, target);
  }
  appendLine(file: string, value: unknown): void {
    const target = this.path(file);
    mkdirSync(dirname(target), { recursive: true });
    appendFileSync(target, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  }
  writeLines(file: string, values: readonly unknown[]): void {
    const target = this.path(file);
    mkdirSync(dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    writeFileSync(temp, values.map((value) => `${JSON.stringify(value)}\n`).join(""), {
      mode: 0o600,
    });
    renameSync(temp, target);
  }
}
