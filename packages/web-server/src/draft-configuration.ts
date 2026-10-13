import type { ModelSelection } from "./ch-harness-catalog.ts";

/** Configuration captured by a draft, independent of later preference changes. */
export interface DraftConfiguration {
  selection: ModelSelection;
  permissionModeId?: string;
}

export function draftPermissionMode(
  inspection: {
    status: string;
    permissionModes?:
      { modes: readonly { id: string }[]; defaultModeId?: string | undefined } | undefined;
  },
  preferred?: string,
): string | undefined {
  if (inspection.status !== "ready") return undefined;
  const catalog = inspection.permissionModes;
  return preferred && catalog?.modes.some((mode) => mode.id === preferred)
    ? preferred
    : catalog?.defaultModeId;
}
