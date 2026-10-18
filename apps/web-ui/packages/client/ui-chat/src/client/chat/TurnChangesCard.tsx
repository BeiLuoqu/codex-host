/** Codex-style end-of-Turn "edited files" card: summary first, per-file diffs on expand. */
import { memo, useMemo, useState } from "react";
import {
  DiffBlock,
  IconChevronDownOutlineRegular,
  IconEditOutlineRegular,
  type DiffBlockLabels,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { ChatNodeStore } from "../contract/snapshot.ts";
import type { ChatViewSlotProps } from "../contract/slots.ts";
import { ChangeStat } from "./ChangeStat.tsx";
import { baseName, sumChanges, useTurnFileChanges } from "./turn-file-changes.ts";
import css from "./TurnChangesCard.module.css";

interface TurnChangesCardProps {
  readonly nodeStore: ChatNodeStore;
  readonly turn: number;
  readonly t: ChatViewSlotProps["t"];
}

/**
 * @param props - the Chat node store, the closed Turn and the Chat locale seat.
 * @returns the card, or nothing when the Turn changed no file.
 */
export const TurnChangesCard = memo(function TurnChangesCard({
  nodeStore,
  turn,
  t,
}: TurnChangesCardProps) {
  const files = useTurnFileChanges(nodeStore, turn);
  const [open, setOpen] = useState(false);
  const labels = useMemo<DiffBlockLabels>(
    () => ({
      codeLabel: t("diff.code"),
      wrapLabel: t("diff.wrap"),
      unwrapLabel: t("diff.unwrap"),
      copy: t("diff.copy"),
      copied: t("diff.copied"),
      collapseAria: t("diff.collapseAria"),
      expandAria: (count) => t("diff.expandAria", { count }),
      collapse: t("diff.collapse"),
      expand: (count) => t("diff.expand", { count }),
    }),
    [t],
  );
  if (files.length === 0) return null;
  const { added, removed } = sumChanges(files);
  const [only] = files;
  const title =
    files.length === 1 && only !== undefined
      ? t("chat.fileEdited", { name: baseName(only.path) })
      : t("chat.filesEdited", { count: files.length });
  return (
    <section className={css.card} data-turn-changes={turn}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <span className={css.icon}>
          <IconEditOutlineRegular size={18} />
        </span>
        <span className={css.text}>
          <span className={css.title}>{title}</span>
          <ChangeStat added={added} removed={removed} />
        </span>
        <IconChevronDownOutlineRegular className={css.chevron} data-open={open} />
      </button>
      {open && (
        <ul className={css.files}>
          {files.map((file) => (
            <li key={file.path} className={css.file}>
              <div className={css.fileHead}>
                <span className={css.path} title={file.path}>
                  {file.path}
                </span>
                <ChangeStat added={file.added} removed={file.removed} />
              </div>
              <DiffBlock diffs={[...file.hunks]} labels={labels} maxLines={12} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});
