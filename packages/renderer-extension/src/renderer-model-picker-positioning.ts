const COLLISION_PADDING = 8;
const MODEL_PICKER_SIDE_OFFSET = 6;
const SELECTION_NOTICE_SIDE_OFFSET = 8;

export const MODEL_PICKER_WIDTH = 254;
export const RENDERER_MODEL_SELECTION_NOTICE_MAX_WIDTH = 320;

export interface RendererMenuRect {
  left: number;
  right: number;
  top: number;
}

export interface RendererTriggerRect extends RendererMenuRect {
  width: number;
}

export interface RendererViewport {
  width: number;
  height: number;
}

/**
 * A picker popover opens bottom-up above its trigger, centered on the trigger and
 * clamped to the viewport. `availableHeight` caps the popover at the space above
 * it, and `originX` anchors the opening animation to the trigger's center.
 */
export interface RendererModelPickerPlacement {
  left: number;
  bottom: number;
  availableHeight: number;
  originX: number;
}

/**
 * Right/bottom anchored so the notice can size to its text: any width up to
 * `maxWidth` stays inside the viewport.
 */
export interface RendererNoticePlacement {
  right: number;
  bottom: number;
  maxWidth: number;
  maxHeight: number;
}

function clampPosition(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function fitWidth(preferredWidth: number, viewportWidth: number): number {
  return Math.max(
    COLLISION_PADDING,
    Math.min(preferredWidth, viewportWidth - COLLISION_PADDING * 2),
  );
}

/**
 * Codex applies its window zoom with CSS `zoom: var(--codex-window-zoom)`, as its own
 * `100dvh / var(--codex-window-zoom)` rules assume. `getBoundingClientRect` and the
 * viewport report device-independent pixels, while the popover, appended under that
 * zoom, is positioned in unzoomed CSS pixels; divide by the zoom like the Agent and
 * Permission Mode pickers do.
 */
export function rendererModelPickerPlacement(
  triggerRect: RendererTriggerRect,
  viewport: RendererViewport,
  popoverWidth: number,
  windowZoom = 1,
): RendererModelPickerPlacement {
  const zoom = Number.isFinite(windowZoom) && windowZoom > 0 ? windowZoom : 1;
  const viewportWidth = viewport.width / zoom;
  const viewportHeight = viewport.height / zoom;
  const left = triggerRect.left / zoom;
  const width = triggerRect.width / zoom;
  const top = triggerRect.top / zoom;
  const menuWidth = Math.max(
    COLLISION_PADDING,
    Math.min(popoverWidth || MODEL_PICKER_WIDTH, viewportWidth - COLLISION_PADDING * 2),
  );
  const center = left + width / 2;
  const menuLeft = Math.min(
    Math.max(center - menuWidth / 2, COLLISION_PADDING),
    Math.max(COLLISION_PADDING, viewportWidth - COLLISION_PADDING - menuWidth),
  );
  return {
    left: menuLeft,
    bottom: Math.max(COLLISION_PADDING, viewportHeight - top + MODEL_PICKER_SIDE_OFFSET),
    availableHeight: Math.max(120, top - MODEL_PICKER_SIDE_OFFSET - COLLISION_PADDING),
    originX: Math.max(0, Math.min(menuWidth, center - menuLeft)),
  };
}

/** Places the selection notice just above the Model trigger, right edges aligned like its menus. */
export function rendererModelSelectionNoticePlacement(
  triggerRect: RendererMenuRect,
  viewport: RendererViewport,
  preferredWidth = RENDERER_MODEL_SELECTION_NOTICE_MAX_WIDTH,
): RendererNoticePlacement {
  const maxWidth = fitWidth(preferredWidth, viewport.width);
  const bottom = Math.max(
    COLLISION_PADDING,
    viewport.height - triggerRect.top + SELECTION_NOTICE_SIDE_OFFSET,
  );
  return {
    right: clampPosition(
      viewport.width - triggerRect.right,
      COLLISION_PADDING,
      viewport.width - COLLISION_PADDING - maxWidth,
    ),
    bottom,
    maxWidth,
    maxHeight: Math.max(COLLISION_PADDING, viewport.height - bottom - COLLISION_PADDING),
  };
}
