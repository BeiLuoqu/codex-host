import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";

const fields = ["outputTokensPerSecond", "timeToFirstOutputMs"] as const;
type Field = (typeof fields)[number];
export type UsageMeasurements = Partial<Record<Field, number>>;
export type StoredUsageMeasurements = Partial<
  Record<Field, { value: number; turnId: string; at: number }>
>;

/** Append-only observed facts. Separate from native history, billing and execution state. */
export class UsageMeasurementsStore {
  private readonly pending = new Set<Promise<void>>();
  private closed = false;
  constructor(
    private readonly directory: string,
    private readonly diagnose: (error: unknown) => void,
  ) {}
  private file(scope: string, sessionId: string): string {
    return join(
      this.directory,
      "usage-measurements-v1",
      createHash("sha256")
        .update(JSON.stringify([scope, sessionId]))
        .digest("hex") + ".jsonl",
    );
  }
  record(
    scope: string,
    sessionId: string,
    turnId: string,
    at: number,
    values: UsageMeasurements,
  ): void {
    if (
      this.closed ||
      !turnId ||
      !Number.isSafeInteger(at) ||
      at < 0 ||
      !Object.keys(values).length
    )
      return;
    const file = this.file(scope, sessionId);
    const task = mkdir(join(this.directory, "usage-measurements-v1"), {
      recursive: true,
      mode: 0o700,
    })
      .then(() =>
        appendFile(file, JSON.stringify({ version: 1, turnId, at, values }) + "\n", {
          mode: 0o600,
        }),
      )
      .catch(this.diagnose)
      .finally(() => {
        this.pending.delete(task);
      });
    this.pending.add(task);
  }
  async read(
    scope: string,
    sessionId: string,
    retainedTurns: ReadonlySet<string>,
  ): Promise<StoredUsageMeasurements> {
    const latest: Partial<Record<Field, { value: number; turnId: string; at: number }>> = {};
    const stream = createReadStream(this.file(scope, sessionId));
    try {
      for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
        if (line.length > 4096) continue;
        let entry: {
          version?: unknown;
          turnId?: unknown;
          at?: unknown;
          values?: Record<string, unknown>;
        };
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }
        if (
          !entry ||
          entry.version !== 1 ||
          typeof entry.turnId !== "string" ||
          !retainedTurns.has(entry.turnId) ||
          typeof entry.at !== "number" ||
          !Number.isSafeInteger(entry.at) ||
          entry.at < 0
        )
          continue;
        for (const field of fields) {
          const value = entry.values?.[field];
          if (
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            value < 0 ||
            (field === "timeToFirstOutputMs" && !Number.isSafeInteger(value))
          )
            continue;
          if (!latest[field] || entry.at >= latest[field].at)
            latest[field] = { value, turnId: entry.turnId, at: entry.at };
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.diagnose(error);
    } finally {
      stream.destroy();
    }
    return latest;
  }
  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(this.pending);
  }
}
