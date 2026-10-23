import { lstat, opendir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  HarnessUsageEntry,
  HarnessUsageSource,
  HarnessUsageStatisticsCapability,
} from "@codexhost/harness-adapter";
import {
  jsonlRecords,
  nativeTimeMs,
  withUsageSession,
} from "@codexhost/harness-adapter/usage-statistics";

import { nativeBrainRoot } from "./fork.js";

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** The home agy resolves `~/.gemini` against: `USERPROFILE` on Windows, `HOME` elsewhere. */
function antigravityHome(environment: NodeJS.ProcessEnv): string {
  return (
    (process.platform === "win32" ? environment.USERPROFILE : environment.HOME) || os.homedir()
  );
}

/**
 * The transcript holding every step of one Conversation. `transcript_full.jsonl` and the files
 * under `chunks/` repeat the same steps, so only this one is read.
 */
function transcriptPath(brainRoot: string, conversationId: string): string {
  return path.join(brainRoot, conversationId, ".system_generated", "logs", "transcript.jsonl");
}

async function listTranscripts(
  brainRoot: string,
  signal: AbortSignal,
): Promise<HarnessUsageSource[]> {
  signal.throwIfAborted();
  const conversations = await opendir(brainRoot).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
  if (!conversations) return [];
  const sources: HarnessUsageSource[] = [];
  for await (const entry of conversations) {
    signal.throwIfAborted();
    if (!entry.isDirectory()) continue;
    const file = transcriptPath(brainRoot, entry.name);
    const info = await lstat(file).catch(() => null);
    if (info?.isFile() && info.size > 0) {
      sources.push({ id: file, fingerprint: `${info.ino}:${info.size}:${info.mtimeMs}` });
    }
  }
  return sources;
}

/**
 * Every model request in one Conversation's `transcript.jsonl`: agy writes one `PLANNER_RESPONSE`
 * step per request with its `input_tokens`, `cache_read_tokens`, `output_tokens` and UTC
 * `created_at`. Verified on Antigravity CLI 1.4.6 transcripts: `input_tokens` excludes cache reads
 * (a follow-up request's `cache_read_tokens` is about the previous request's whole prompt), so
 * input is recombined to include them. The transcript records neither the model, cache writes,
 * thinking tokens nor the working directory; they stay unknown. The entry ID leaves out the
 * Conversation, so a copy of a request in a derived Conversation deduplicates with the original.
 */
export async function readAntigravityUsage(
  file: string,
  signal: AbortSignal,
): Promise<HarnessUsageEntry[]> {
  const sessionId = path.basename(path.resolve(file, "..", "..", ".."));
  // A step written again replaces its earlier record rather than counting twice.
  const requests = new Map<number, HarnessUsageEntry>();
  for await (const record of jsonlRecords(file, '"input_tokens"', signal)) {
    if (record.type !== "PLANNER_RESPONSE") continue;
    const step = count(record.step_index);
    const input = count(record.input_tokens);
    const output = count(record.output_tokens);
    const cached = count(record.cache_read_tokens);
    const at = nativeTimeMs(record.created_at);
    if (step === null || input === null || output === null || at === null) continue;
    requests.set(
      step,
      withUsageSession(
        {
          id: `${String(record.created_at)}:${step}:${input}:${cached ?? "-"}:${output}`,
          occurredAtMs: at,
          inputTokens: input + (cached ?? 0),
          ...(cached !== null ? { cachedInputTokens: cached } : {}),
          outputTokens: output,
        },
        { sessionId },
      ),
    );
  }
  return [...requests.values()];
}

/** Read-only access to agy's own transcripts; never starts agy or calls its Language Server. */
export function createAntigravityUsageStatistics(
  environment: NodeJS.ProcessEnv,
): HarnessUsageStatisticsCapability {
  const brainRoot = nativeBrainRoot(antigravityHome(environment));
  return Object.freeze({
    listSources: (signal: AbortSignal) => listTranscripts(brainRoot, signal),
    readSource: (id: string, signal: AbortSignal) => readAntigravityUsage(id, signal),
  });
}
