import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { UseProjection } from "@deepseek-ai/dsh-api-session-controller/client";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import {
  useAnchoredPosition,
  useDismissOnOutsidePointer,
} from "@deepseek-ai/dsh-client-ui-primitives";

import type { HostAccountCredits, HostThreadUsage } from "./usage.ts";
import css from "./HostUsageDock.module.css";

type HostUsageDockProps = PropsLocale<"codexhostImport"> & { useProjection: UseProjection };
type Translate = HostUsageDockProps["t"];

interface DetailRow {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
}

interface DetailGroup {
  readonly label: string;
  readonly rows: readonly DetailRow[];
}

const MEASURE_STYLE: CSSProperties = { visibility: "hidden", left: 0, top: 0 };

function decimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace(/\.?0+$/u, "");
}

function tokenCount(value: number): string {
  if (value < 1_000) return String(Math.round(value));
  if (value < 1_000_000) return `${decimal(value / 1_000)}K`;
  if (value < 1_000_000_000) return `${decimal(value / 1_000_000)}M`;
  return `${decimal(value / 1_000_000_000)}B`;
}

function percent(value: number): string {
  return `${decimal(value)}%`;
}

function contextPercent(usage: HostThreadUsage): number | undefined {
  return (
    usage.contextUsagePercent ??
    (usage.contextUsedTokens !== undefined && usage.contextWindowTokens !== undefined
      ? (usage.contextUsedTokens / usage.contextWindowTokens) * 100
      : undefined)
  );
}

function tokenRate(value: number, t: Translate): string {
  return `${value >= 100 ? Math.round(value) : decimal(value)} ${t("usage.unit.tps")}`;
}

function latency(value: number, t: Translate): string {
  return value < 1_000
    ? `${Math.round(value)} ${t("usage.unit.ms")}`
    : `${decimal(value / 1_000)} ${t("usage.unit.seconds")}`;
}

function cost(usage: HostThreadUsage): string | null {
  if (usage.totalCostUsd === undefined) return null;
  const formatted = `$${usage.totalCostUsd.toFixed(usage.totalCostUsd >= 1 ? 2 : 3)}`;
  return usage.unpricedModels?.length ? `≥${formatted}` : formatted;
}

function credits(value: number, t: Translate): string {
  const amount = value > 0 && value < 0.001 ? "<0.001" : decimal(value, 3);
  return `${amount} ${t("usage.unit.credits")}`;
}

function resetTime(value: string | number | undefined): string | null {
  if (value === undefined) return null;
  const date = new Date(typeof value === "number" ? value * 1_000 : value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function quotaValue(used: number | undefined, limit: number | undefined, unit?: string): string {
  if (used === undefined || limit === undefined) return "";
  return `${decimal(used, 2)} / ${decimal(limit, 2)}${unit ? ` ${unit}` : ""}`;
}

function summaryParts(
  usage: HostThreadUsage | null,
  account: HostAccountCredits | undefined,
  t: Translate,
): string[] {
  if (usage === null)
    return account ? [`${t("usage.quota")}: ${percent(account.usedPercent)}`] : [];
  const result = [
    usage.cacheHitRatePercent === undefined
      ? null
      : `${t("usage.cache.short")} ${percent(usage.cacheHitRatePercent)}`,
    usage.outputTokensPerSecond !== undefined
      ? tokenRate(usage.outputTokensPerSecond, t)
      : usage.apiOutputTokensPerSecond !== undefined
        ? `API ${tokenRate(usage.apiOutputTokensPerSecond, t)}`
        : null,
    cost(usage),
  ].filter((value): value is string => value !== null);
  if (result.length > 0) return result;
  if (usage.totalTokens !== undefined)
    return [`${tokenCount(usage.totalTokens)} ${t("usage.unit.tokens")}`];
  const context = contextPercent(usage);
  if (context !== undefined) return [`${t("usage.context")}: ${percent(context)}`];
  if (account) return [`${t("usage.quota")}: ${percent(account.usedPercent)}`];
  return [];
}

function usageGroups(
  usage: HostThreadUsage | null,
  account: HostAccountCredits | undefined,
  t: Translate,
): DetailGroup[] {
  const groups: DetailGroup[] = [];
  if (usage !== null) {
    const session: DetailRow[] = [];
    const formattedCost = cost(usage);
    if (formattedCost !== null)
      session.push({
        label: usage.costSource === "publicPrice" ? t("usage.cost.estimate") : t("usage.cost"),
        value: formattedCost,
        ...(usage.unpricedModels?.length
          ? { note: `${t("usage.unpriced")}: ${usage.unpricedModels.join(", ")}` }
          : {}),
      });
    if (usage.totalCredits !== undefined)
      session.push({ label: t("usage.credits"), value: credits(usage.totalCredits, t) });
    if (usage.sessionCacheHitRatePercent !== undefined)
      session.push({
        label: t("usage.cache.average"),
        value: percent(usage.sessionCacheHitRatePercent),
      });
    if (usage.cacheHitRatePercent !== undefined)
      session.push({
        label: t("usage.cache.latest"),
        value: percent(usage.cacheHitRatePercent),
      });
    if (session.length) groups.push({ label: t("usage.group.session"), rows: session });

    const turn: DetailRow[] = [];
    if (usage.outputTokensPerSecond !== undefined)
      turn.push({ label: t("usage.speed"), value: tokenRate(usage.outputTokensPerSecond, t) });
    else if (usage.apiOutputTokensPerSecond !== undefined)
      turn.push({
        label: t("usage.speed.api"),
        value: tokenRate(usage.apiOutputTokensPerSecond, t),
      });
    if (usage.timeToFirstOutputMs !== undefined)
      turn.push({ label: t("usage.ttft"), value: latency(usage.timeToFirstOutputMs, t) });
    if (turn.length) groups.push({ label: t("usage.group.turn"), rows: turn });

    const tokens: DetailRow[] = [];
    if (usage.inputTokens !== undefined || usage.outputTokens !== undefined)
      tokens.push({
        label: t("usage.tokens.io"),
        value: `${usage.inputTokens === undefined ? "—" : tokenCount(usage.inputTokens)} / ${usage.outputTokens === undefined ? "—" : tokenCount(usage.outputTokens)}`,
      });
    if (usage.cachedInputTokens !== undefined || usage.cacheWriteInputTokens !== undefined)
      tokens.push({
        label:
          usage.cacheWriteInputTokens !== undefined && usage.cacheWriteInputTokens > 0
            ? t("usage.tokens.cacheReadWrite")
            : t("usage.tokens.cacheRead"),
        value:
          usage.cacheWriteInputTokens !== undefined && usage.cacheWriteInputTokens > 0
            ? `${usage.cachedInputTokens === undefined ? "—" : tokenCount(usage.cachedInputTokens)} / ${tokenCount(usage.cacheWriteInputTokens)}`
            : tokenCount(usage.cachedInputTokens ?? 0),
      });
    if (usage.totalTokens !== undefined)
      tokens.push({ label: t("usage.tokens.total"), value: tokenCount(usage.totalTokens) });
    if (tokens.length) groups.push({ label: t("usage.group.tokens"), rows: tokens });

    const plan: DetailRow[] = [];
    for (const [label, used, reset] of [
      [t("usage.plan.fiveHour"), usage.planFiveHourUsedPercent, usage.planFiveHourResetsAtUnix],
      [t("usage.plan.sevenDay"), usage.planSevenDayUsedPercent, usage.planSevenDayResetsAtUnix],
    ] as const) {
      if (used === undefined) continue;
      const at = resetTime(reset);
      plan.push({
        label,
        value: percent(used),
        ...(at ? { note: `${t("usage.resets")}: ${at}` } : {}),
      });
    }
    if (plan.length) groups.push({ label: t("usage.group.plan"), rows: plan });
  }

  if (account) {
    const accountRows: DetailRow[] = [];
    const primary = quotaValue(account.used, account.limit, account.unit);
    accountRows.push({
      label: account.label ?? t("usage.quota"),
      value: primary
        ? `${percent(account.usedPercent)} · ${primary}`
        : percent(account.usedPercent),
      ...(resetTime(account.resetsAt)
        ? { note: `${t("usage.resets")}: ${resetTime(account.resetsAt)}` }
        : {}),
    });
    if (account.resetCredits) {
      const expires = resetTime(account.resetCredits.nextExpiresAt);
      accountRows.push({
        label: t("usage.resetCredits"),
        value: String(account.resetCredits.availableCount),
        ...(expires ? { note: `${t("usage.resets")}: ${expires}` } : {}),
      });
    }
    for (const product of account.productUsage ?? []) {
      const productValue = quotaValue(product.used, product.limit, product.unit);
      accountRows.push({
        label: product.product,
        value: productValue
          ? `${percent(product.usagePercent)} · ${productValue}`
          : percent(product.usagePercent),
        ...(resetTime(product.resetsAt)
          ? { note: `${t("usage.resets")}: ${resetTime(product.resetsAt)}` }
          : {}),
      });
    }
    groups.push({ label: t("usage.group.quota"), rows: accountRows });
  }
  return groups;
}

function ContextSummary({ usage, t }: { usage: HostThreadUsage | null; t: Translate }) {
  if (usage === null) return null;
  const usedPercent = contextPercent(usage);
  if (usedPercent === undefined) return null;
  const value =
    usage.contextWindowTokens === undefined
      ? percent(usedPercent)
      : `${percent(usedPercent)} / ${tokenCount(usage.contextWindowTokens)}`;
  return (
    <section className={css.context}>
      <div className={css.contextRow}>
        <span>{t("usage.context")}</span>
        <strong>{value}</strong>
      </div>
      <div
        className={css.progressTrack}
        role="progressbar"
        aria-label={t("usage.context")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.max(0, usedPercent))}
      >
        <span
          className={css.progressFill}
          style={{ width: `${Math.min(100, Math.max(0, usedPercent))}%` }}
        />
      </div>
    </section>
  );
}

function DetailGroups({ groups }: { groups: readonly DetailGroup[] }): ReactNode {
  return groups.map((group) => (
    <section className={css.group} key={group.label}>
      <h3>{group.label}</h3>
      <dl>
        {group.rows.map((row) => (
          <div className={css.detail} key={`${row.label}:${row.value}`}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
            {row.note && <p>{row.note}</p>}
          </div>
        ))}
      </dl>
    </section>
  ));
}

/** Compact CH metrics plus a hover/focus/click-pinned detail dialog. */
export function HostUsageDock({ useProjection, t }: HostUsageDockProps) {
  const projection = useProjection("codexhostUsage");
  const usage = projection?.usage ?? null;
  const account = projection?.accountCredits;
  const summary = useMemo(() => summaryParts(usage, account, t), [usage, account, t]);
  const groups = useMemo(() => usageGroups(usage, account, t), [usage, account, t]);
  const hasContext = usage !== null && contextPercent(usage) !== undefined;
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const position = useAnchoredPosition({
    open,
    anchorRef: rootRef,
    panelRef,
    side: "top",
    gap: 8,
    margin: 12,
  });
  const close = useCallback(() => {
    pinned.current = false;
    setOpen(false);
  }, []);
  const cancelClose = useCallback(() => {
    if (closeTimer.current === null) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      if (
        !pinned.current &&
        rootRef.current?.matches(":hover") !== true &&
        panelRef.current?.matches(":hover") !== true &&
        !rootRef.current?.contains(document.activeElement)
      )
        setOpen(false);
    }, 140);
  }, [cancelClose]);

  useDismissOnOutsidePointer(
    rootRef,
    open,
    (next) => {
      if (!next) close();
    },
    panelRef,
  );
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, open]);
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (summary.length === 0) close();
  }, [close, summary.length]);

  if (summary.length === 0 || (groups.length === 0 && !hasContext)) return null;
  const summaryText = summary.join(" · ");
  const aria = `${t("usage.title")}: ${summaryText}`;
  return (
    <span
      ref={rootRef}
      className={css.anchor}
      data-composer-stat="codexhost-usage"
      onPointerEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onPointerLeave={scheduleClose}
    >
      <button
        type="button"
        className={css.pill}
        aria-label={aria}
        aria-haspopup="dialog"
        aria-expanded={open}
        onFocus={() => {
          cancelClose();
          setOpen(true);
        }}
        onBlur={scheduleClose}
        onClick={() => {
          if (open && pinned.current) close();
          else {
            pinned.current = true;
            setOpen(true);
          }
        }}
      >
        <span className={css.label}>{summaryText}</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className={css.panel}
            style={position ?? MEASURE_STYLE}
            role="dialog"
            aria-label={t("usage.details")}
            onPointerEnter={cancelClose}
            onPointerLeave={scheduleClose}
          >
            <header>{t("usage.title")}</header>
            <ContextSummary usage={usage} t={t} />
            <DetailGroups groups={groups} />
          </div>,
          document.body,
        )}
    </span>
  );
}
