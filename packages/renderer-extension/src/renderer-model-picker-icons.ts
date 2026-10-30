import createElement from "lucide/dist/esm/createElement.mjs";
import Check from "lucide/dist/esm/icons/check.mjs";
import ChevronDown from "lucide/dist/esm/icons/chevron-down.mjs";
import ChevronRight from "lucide/dist/esm/icons/chevron-right.mjs";
import RotateCcw from "lucide/dist/esm/icons/rotate-ccw.mjs";
import Star from "lucide/dist/esm/icons/star.mjs";
import Zap from "lucide/dist/esm/icons/zap.mjs";

// Lucide (ISC) is already a Renderer dependency; the picker uses only its icons.
const ICONS = {
  check: Check,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  reset: RotateCcw,
  bolt: Zap,
  boltFill: Zap,
} as const;

export type ModelPickerIconName = keyof typeof ICONS;

export function createModelPickerIcon(
  name: ModelPickerIconName,
  size: number,
  className?: string,
): SVGSVGElement {
  return createElement(ICONS[name], {
    width: size,
    height: size,
    "aria-hidden": "true",
    focusable: "false",
    // The filled bolt marks Fast as on.
    ...(name === "boltFill" ? { fill: "currentColor" } : {}),
    ...(className ? { class: className } : {}),
  }) as SVGSVGElement;
}

/** Match Paseo's FavoriteStar: Lucide Star, ICON_SIZE.md (16), default stroke 2. */
export function createModelFavoriteIcon(ownerDocument: Document): SVGElement {
  return ownerDocument.adoptNode(
    createElement(Star, {
      width: 16,
      height: 16,
      "aria-hidden": "true",
      focusable: "false",
    }),
  );
}
