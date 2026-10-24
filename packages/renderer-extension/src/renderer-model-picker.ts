/**
 * The External Harness Model control: one popover with two views, matching the
 * native Codex composer picker. The "simple" view is a Thinking slider with the
 * selected Model above it; the "advanced" view is the Model list, which keeps
 * search and favorites for long catalogs.
 *
 * Both views share one trigger, one open/close lifecycle and one pending
 * selection state, so they stay in this module; splitting them would need a
 * bidirectional interface for no ownership gain. Styling, icons, Thinking
 * ordering and placement live in their own modules.
 */
import { catalogModelForRef } from "@codexhost/shared-contracts";
import type {
  HarnessModel,
  HarnessModelCatalog,
  HarnessModelRef,
  HarnessThinkingOption,
  HarnessThinkingOptionId,
} from "@codexhost/shared-contracts";
import createElement from "lucide/dist/esm/createElement.mjs";
import CircleAlert from "lucide/dist/esm/icons/circle-alert.mjs";
import Search from "lucide/dist/esm/icons/search.mjs";

import { rendererHarnessMessages } from "./renderer-harness-localization.js";
import { readModelFavorites, writeModelFavorites } from "./renderer-model-favorites.js";
import { createModelFavoriteIcon, createModelPickerIcon } from "./renderer-model-picker-icons.js";
import {
  isMaximumThinkingOption,
  modelPickerMessages,
  modelPickerSliderLeft,
  modelPickerSliderRangeTransform,
  orderedThinkingOptions,
  SLIDER_DRAG_THRESHOLD,
  SLIDER_KEY_COMMIT_DELAY_MS,
  SLIDER_THUMB_HIT_RADIUS,
  SLIDER_THUMB_INSET,
  SLIDER_WHEEL_RESET_MS,
  SLIDER_WHEEL_STEP,
  thinkingOptionRank,
} from "./renderer-model-picker-intelligence.js";
import { rendererModelPickerPlacement } from "./renderer-model-picker-positioning.js";
import { ensureRendererModelPickerStyle } from "./renderer-model-picker-style.js";
import {
  mountRendererModelSelectionNotice,
  type RendererModelSelectionNotice,
} from "./renderer-model-selection-notice.js";
import {
  applyRendererTriggerChipSqueezeRoot,
  applyRendererTriggerChipSqueezeTrigger,
  ensureRendererTriggerChipStyle,
  rendererModelTriggerMaxWidth,
  TRIGGER_CHIP_CLASS,
} from "./renderer-trigger-chip-style.js";
import type { RendererSettingsLocale } from "./settings/localization.js";

function createModelPickerElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

/** Per-row controls the picker reuses across renders instead of rebuilding DOM. */
interface ModelRowControl {
  row: HTMLDivElement;
  item: HTMLButtonElement;
  check: SVGSVGElement;
  favorite: HTMLButtonElement;
  label: string;
  searchText: string;
}

interface SliderDrag {
  pointerId: number;
  startX: number;
  startY: number;
  start: number;
  width: number;
  steps: number;
  thumbOffset: number;
  continuous: boolean;
  moved: boolean;
}

interface SliderGeometry {
  start: number;
  width: number;
  scale: number;
  steps: number;
}

/** Thinking slider state; the rendered view derives from it on every change. */
interface ThinkingSliderState {
  options: HarnessThinkingOption[];
  signature: string;
  ticks: HTMLElement[];
  selectedIndex: number;
  previewIndex: number | null;
  dragValue: number | null;
  pendingCommitId: string | null;
  keyTimer: number | undefined;
  drag: SliderDrag | null;
  hoverIndex: number | null;
  thumbHovered: boolean;
  wheel: { accumulated: number; last: number };
  disabled: boolean;
}

type ModelPickerView = "simple" | "advanced";

export interface RendererModelControlView {
  status: "idle" | "waitingForAdapter" | "loading" | "ready" | "selecting" | "empty" | "error";
  catalog?: HarnessModelCatalog;
  selected?: HarnessModelRef;
  selectedThinkingOptionId?: HarnessThinkingOptionId;
  resolvedModelLabel?: string;
  thinkingSelectionSupported?: boolean;
  error?: string;
  /**
   * Which user choice Host rejected. Set only for a rejected Model or Thinking
   * selection, never when the catalog or Thread inspection failed to load.
   */
  selectionRejected?: "model" | "thinking";
  /** Unique per rejection, so repeating a rejected choice shows its notice again. */
  selectionErrorId?: number;
}

export interface RendererModelPickerPresentation {
  modelLabel: string;
  thinkingLabel?: string;
  resolvedModelLabel?: string;
  thinkingOptions: HarnessThinkingOption[];
  showThinkingSection: boolean;
  thinkingSelectionEnabled: boolean;
}

export interface RendererModelPickerControl {
  root: HTMLElement;
  trigger: HTMLButtonElement;
  label: HTMLElement;
  thinkingLabel: HTMLElement;
  fastMark: SVGSVGElement;
  errorMark: HTMLElement;
  selectionNotice: RendererModelSelectionNotice;
  /** Newest `selectionErrorId` this control has presented (or skipped while its menu was open). */
  lastSelectionErrorId: number;
  popover: HTMLElement;
  menu: HTMLElement;
  simplePanel: HTMLElement;
  listPanel: HTMLElement;
  viewControls: HTMLElement;
  viewToggle: HTMLButtonElement;
  viewModelLabel: HTMLElement;
  viewEffortLabel: HTMLElement;
  fastToggle: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  slider: HTMLElement;
  sliderRoot: HTMLElement;
  sliderInstructions: HTMLElement;
  listHeading: HTMLElement;
  searchRow: HTMLElement;
  searchInput: HTMLInputElement;
  searchSeparator: HTMLElement;
  searchEmpty: HTMLElement;
  rows: HTMLElement;
  harnessId: string;
  locale: RendererSettingsLocale;
  favorites: Set<string>;
  options: Map<string, ModelRowControl>;
  modelsSignature: string | null;
  menuView: ModelPickerView;
  effectiveView: ModelPickerView;
  view: RendererModelControlView | undefined;
  fastNext: HarnessModelRef | undefined;
  pendingModelId: string | null;
  pendingReset: { modelId: string; thinkingId: string | undefined } | null;
  sliderState: ThinkingSliderState;
  setSliderOptions(options: HarnessThinkingOption[]): void;
  renderSlider(animate?: boolean): void;
  syncViewState(): void;
  measure(): void;
  commitThinking(optionId: string): void;
  focusActiveView(keyboard?: boolean): void;
  isOpen(): boolean;
  open(keyboard?: boolean): void;
  close(options?: { commitPending?: boolean }): void;
  dispose(): void;
}

const MODEL_PICKER_SEARCH_THRESHOLD = 8;
let latestPresentedSelectionErrorId = 0;
let nextModelPickerInstanceId = 0;

function popoverOpen(menu: HTMLElement): boolean {
  try {
    return menu.matches(":popover-open");
  } catch {
    return false;
  }
}
export function thinkingOptionsForModel(
  catalog: HarnessModelCatalog | undefined,
  selected: HarnessModelRef | undefined,
): HarnessThinkingOption[] {
  const supported = catalogModelForRef(catalog, selected)?.supportedThinkingOptionIds;
  if (!supported) return [];
  return catalog?.thinkingOptions.filter((option) => supported.includes(option.id)) ?? [];
}
export function isRendererModelPickerDisabled(view: RendererModelControlView): boolean {
  return (
    view.status === "waitingForAdapter" ||
    view.status === "loading" ||
    view.status === "selecting" ||
    view.status === "empty" ||
    view.catalog === void 0
  );
}
export function shouldCloseRendererModelPicker(view: RendererModelControlView): boolean {
  return isRendererModelPickerDisabled(view) && view.status !== "selecting";
}
function isTransientPickerState(view: RendererModelControlView): boolean {
  return view.status === "idle" || view.status === "loading";
}
export function rendererModelSelectionFailed(view: RendererModelControlView): boolean {
  return view.status === "error" && view.selectionRejected !== void 0 && Boolean(view.error);
}
export function shouldOpenRendererModelSelectionNotice(
  view: RendererModelControlView,
  lastPresentedErrorId: number,
): view is RendererModelControlView & { selectionErrorId: number } {
  return (
    rendererModelSelectionFailed(view) &&
    view.selectionErrorId !== void 0 &&
    view.selectionErrorId > lastPresentedErrorId
  );
}
export function rendererModelSelectionNoticeContent(
  view: RendererModelControlView,
  locale: RendererSettingsLocale = "en",
): { heading: string; message: string } {
  const messages = rendererHarnessMessages(locale);
  return {
    heading:
      view.selectionRejected === "thinking"
        ? messages.thinkingSelectionRejected
        : messages.modelSelectionRejected,
    message: view.error ?? "",
  };
}
export function rendererModelPickerPresentation(
  view: RendererModelControlView,
  locale: RendererSettingsLocale = "en",
): RendererModelPickerPresentation {
  const messages = modelPickerMessages(locale);
  const selectedModel = catalogModelForRef(view.catalog, view.selected);
  const thinkingOptions =
    view.thinkingSelectionSupported === false
      ? []
      : thinkingOptionsForModel(view.catalog, view.selected);
  const selectedThinking = thinkingOptions.find(({ id }) => id === view.selectedThinkingOptionId);
  const showThinkingSection =
    thinkingOptions.length > 0 &&
    !(thinkingOptions.length === 1 && thinkingOptions[0]?.id === "off");
  const resolvedModelLabel = view.resolvedModelLabel ?? selectedModel?.resolvedModelLabel;
  let modelLabel = messages.selectModel;
  if (selectedModel) modelLabel = selectedModel.label;
  else if (view.status === "waitingForAdapter" || view.status === "loading") {
    modelLabel = messages.loadingModels;
  } else if (view.status === "selecting") modelLabel = messages.selecting;
  else if (view.status === "empty") modelLabel = messages.noModels;
  else if (view.status === "error") modelLabel = messages.modelsUnavailable;
  return {
    modelLabel,
    ...(resolvedModelLabel && resolvedModelLabel !== modelLabel ? { resolvedModelLabel } : {}),
    thinkingOptions,
    showThinkingSection,
    thinkingSelectionEnabled: thinkingOptions.length > 1,
    ...(showThinkingSection && selectedThinking ? { thinkingLabel: selectedThinking.label } : {}),
  };
}
export function syncRendererModelTriggerClass(control: RendererModelPickerControl): void {
  control.trigger.className = TRIGGER_CHIP_CLASS;
  control.trigger.setAttribute("data-codexhost-model-picker-trigger", "true");
  applyRendererTriggerChipSqueezeTrigger(control.trigger);
  applyRendererTriggerChipSqueezeRoot(control.root, rendererModelTriggerMaxWidth());
}
export function syncRendererLabelText(
  element: { textContent: string | null },
  text: string,
): boolean {
  if (element.textContent === text) return false;
  element.textContent = text;
  return true;
}
function modelPickerReducedMotion(): boolean {
  if (document.documentElement?.getAttribute("data-reduced-motion") === "true") return true;
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}
function modelPickerWindowZoom(): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--codex-window-zoom")
    .trim();
  const zoom = Number.parseFloat(raw);
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

function positionRendererModelPicker(control: RendererModelPickerControl): void {
  const placement = rendererModelPickerPlacement(
    control.trigger.getBoundingClientRect(),
    { width: window.innerWidth, height: window.innerHeight },
    control.popover.offsetWidth,
    modelPickerWindowZoom(),
  );
  control.popover.style.left = `${placement.left}px`;
  control.popover.style.right = "auto";
  control.popover.style.top = "auto";
  control.popover.style.bottom = `${placement.bottom}px`;
  control.popover.style.setProperty(
    "--codexhost-model-picker-available-height",
    `${placement.availableHeight}px`,
  );
  control.popover.style.setProperty(
    "--codexhost-model-picker-origin",
    `${placement.originX}px 100%`,
  );
}
function applyModelSearchFilter(control: RendererModelPickerControl): void {
  const query = control.searchRow.hidden ? "" : control.searchInput.value.trim().toLowerCase();
  let visibleCount = 0;
  for (const option of control.options.values()) {
    const matches = query.length === 0 || option.searchText.includes(query);
    option.row.hidden = !matches;
    if (matches) visibleCount += 1;
  }
  control.searchEmpty.hidden = control.options.size === 0 || visibleCount > 0;
}
function syncModelFavorite(
  control: RendererModelPickerControl,
  option: ModelRowControl,
  favorite: boolean,
): void {
  const messages = modelPickerMessages(control.locale);
  option.favorite.setAttribute("aria-pressed", String(favorite));
  const label = favorite ? messages.unfavorite(option.label) : messages.favorite(option.label);
  option.favorite.setAttribute("aria-label", label);
  option.favorite.title = label;
}
function orderModelFavorites(control: RendererModelPickerControl): void {
  for (const favorite of [true, false]) {
    for (const [id, option] of control.options) {
      const isFavorite = control.favorites.has(id);
      syncModelFavorite(control, option, isFavorite);
      if (isFavorite === favorite) control.rows.append(option.row);
    }
  }
}
function rebuildModelRows(
  control: RendererModelPickerControl,
  models: readonly HarnessModel[],
): void {
  control.options.clear();
  control.rows.replaceChildren();
  for (const model2 of models) {
    const row = createModelPickerElement("div", "codexhost-model-picker-row");
    row.setAttribute("role", "presentation");
    const item = createModelPickerElement("button", "codexhost-model-picker-item");
    item.type = "button";
    item.dataset.modelId = model2.ref.id;
    item.setAttribute("role", "menuitemradio");
    item.setAttribute("aria-checked", "false");
    const text = createModelPickerElement("span", "codexhost-model-picker-item-label");
    text.textContent = model2.label;
    text.title =
      model2.resolvedModelLabel && model2.resolvedModelLabel !== model2.label
        ? `${model2.label} (${model2.resolvedModelLabel})`
        : model2.label;
    const check2 = createModelPickerIcon("check", 16, "codexhost-model-picker-item-check");
    check2.style.display = "none";
    item.append(text, check2);
    const favorite = createModelPickerElement("button", "codexhost-model-picker-favorite");
    favorite.type = "button";
    favorite.dataset.favoriteModelId = model2.ref.id;
    favorite.append(createModelFavoriteIcon(document));
    row.append(item, favorite);
    control.options.set(model2.ref.id, {
      row,
      item,
      check: check2,
      favorite,
      label: model2.label,
      searchText:
        `${model2.label} ${model2.ref.id} ${model2.resolvedModelLabel ?? ""}`.toLowerCase(),
    });
    control.rows.append(row);
  }
  orderModelFavorites(control);
  applyModelSearchFilter(control);
}
function modelPickerDefaults(
  view: RendererModelControlView,
): { modelId: string; thinkingId: string | undefined } | null {
  const catalog = view.catalog;
  const defaultModel = catalogModelForRef(catalog, catalog?.defaultModel);
  if (!catalog || !defaultModel) return null;
  const defaultThinking =
    view.thinkingSelectionSupported === false
      ? void 0
      : thinkingOptionsForModel(catalog, defaultModel.ref).find(
          ({ id }) => id === catalog.defaultThinkingOptionId,
        )?.id;
  return { modelId: defaultModel.ref.id, thinkingId: defaultThinking };
}
function modelPickerResetAvailable(view: RendererModelControlView): boolean {
  const defaults = modelPickerDefaults(view);
  if (!defaults) return false;
  const selected = catalogModelForRef(view.catalog, view.selected);
  if (!selected) return false;
  if (selected.ref.id !== defaults.modelId || view.selected?.id !== selected.ref.id) return true;
  return (
    defaults.thinkingId !== void 0 &&
    view.selectedThinkingOptionId !== void 0 &&
    view.selectedThinkingOptionId !== defaults.thinkingId
  );
}

export function mountRendererModelPicker(
  composerId: string,
  onSelectModel: (modelId: string) => void,
  onSelectThinking: (thinkingOptionId: string) => void,
): RendererModelPickerControl {
  ensureRendererTriggerChipStyle(document);
  ensureRendererModelPickerStyle(document);
  const instanceId = ++nextModelPickerInstanceId;
  const element = createModelPickerElement;
  const root = element("div", "relative min-w-0");
  root.setAttribute("data-codexhost-model-control", composerId);
  root.style.display = "none";
  applyRendererTriggerChipSqueezeRoot(root, rendererModelTriggerMaxWidth());
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("data-state", "closed");
  trigger.setAttribute("data-codexhost-model-picker-trigger", "true");
  trigger.className = TRIGGER_CHIP_CLASS;
  applyRendererTriggerChipSqueezeTrigger(trigger);
  const fastMark = createModelPickerIcon("boltFill", 14, "codexhost-model-picker-trigger-icon");
  fastMark.style.display = "none";
  const label = element("span", "codexhost-model-picker-trigger-model");
  const thinkingLabel = element("span", "codexhost-model-picker-trigger-effort");
  // Narrow composers hide this label (renderer-trigger-chip-style).
  thinkingLabel.dataset.codexhostModelThinking = "";
  thinkingLabel.hidden = true;
  const errorMark = element("span", "codexhost-model-picker-trigger-error");
  errorMark.hidden = true;
  errorMark.append(
    createElement(CircleAlert, {
      width: 14,
      height: 14,
      "aria-hidden": "true",
      focusable: "false",
      "stroke-width": 1.8,
    }),
  );
  const chevron = createModelPickerIcon(
    "chevronDown",
    16,
    "codexhost-model-picker-trigger-chevron",
  );
  trigger.append(fastMark, label, thinkingLabel, errorMark, chevron);
  root.append(trigger);
  const selectionNotice = mountRendererModelSelectionNotice(trigger);
  const popover = element("div", "codexhost-model-picker-popover");
  popover.id = `${composerId}-model-menu`;
  popover.setAttribute("popover", "manual");
  popover.setAttribute("role", "menu");
  popover.setAttribute("data-codexhost-model-picker", "true");
  popover.tabIndex = -1;
  trigger.setAttribute("aria-controls", popover.id);
  const menu = element("div", "codexhost-model-picker-menu");
  menu.dataset.view = "simple";
  menu.dataset.transitionsReady = "false";
  const simpleTrack = element("div", "codexhost-model-picker-track");
  const simplePanel = element("div", "codexhost-model-picker-panel");
  const topRowMotion = element("div", "codexhost-model-picker-motion");
  topRowMotion.dataset.motion = "top-row";
  const viewControls = element("div", "codexhost-model-picker-view-controls");
  viewControls.dataset.effortHeader = "true";
  const viewToggle = element("button", "codexhost-model-picker-view-toggle");
  viewToggle.type = "button";
  viewToggle.setAttribute("role", "menuitem");
  viewToggle.setAttribute("aria-haspopup", "menu");
  const viewToggleContent = element("span", "codexhost-model-picker-view-toggle-content");
  const viewModelLabel = element("span", "codexhost-model-picker-model-label");
  const viewEffortLabel = element("span", "codexhost-model-picker-effort-label");
  const viewToggleIcon = createModelPickerIcon(
    "chevronRight",
    12,
    "codexhost-model-picker-view-toggle-icon",
  );
  viewToggleContent.append(viewModelLabel, viewEffortLabel, viewToggleIcon);
  viewToggle.append(viewToggleContent);
  const fastToggle = element("button", "codexhost-model-picker-icon-button");
  fastToggle.type = "button";
  fastToggle.dataset.position = "start";
  fastToggle.setAttribute("role", "menuitemcheckbox");
  fastToggle.hidden = true;
  const fastToggleContent = element("span", "codexhost-model-picker-icon-button-content");
  fastToggleContent.append(
    createModelPickerIcon("bolt", 16, "codexhost-model-picker-fast-off"),
    createModelPickerIcon("boltFill", 16, "codexhost-model-picker-fast-on"),
  );
  fastToggle.append(fastToggleContent);
  const resetButton = element("button", "codexhost-model-picker-icon-button");
  resetButton.type = "button";
  resetButton.dataset.position = "end";
  resetButton.setAttribute("role", "menuitem");
  resetButton.hidden = true;
  const resetContent = element("span", "codexhost-model-picker-icon-button-content");
  resetContent.append(createModelPickerIcon("reset", 16));
  resetButton.append(resetContent);
  viewControls.append(viewToggle, fastToggle, resetButton);
  topRowMotion.append(viewControls);
  const sliderMotion = element("div", "codexhost-model-picker-motion");
  sliderMotion.dataset.motion = "slider";
  const simpleView = element("div", "codexhost-model-picker-simple-view");
  const sliderStatus = element("span", "codexhost-model-picker-sr-only");
  sliderStatus.id = `codexhost-model-picker-${instanceId}-status`;
  sliderStatus.setAttribute("role", "status");
  sliderStatus.setAttribute("aria-live", "polite");
  const sliderInstructions = element("span", "codexhost-model-picker-sr-only");
  sliderInstructions.id = `codexhost-model-picker-${instanceId}-instructions`;
  const slider = element("div", "codexhost-model-picker-slider");
  slider.setAttribute("role", "slider");
  slider.setAttribute("aria-orientation", "horizontal");
  slider.setAttribute("aria-describedby", `${sliderStatus.id} ${sliderInstructions.id}`);
  slider.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight");
  slider.tabIndex = 0;
  const sliderRoot = element("div", "codexhost-model-picker-slider-root");
  const sliderTrack = element("span", "codexhost-model-picker-slider-track");
  const sliderRange = element("span", "codexhost-model-picker-slider-range");
  sliderRange.setAttribute("aria-hidden", "true");
  sliderRange.append(element("span", "codexhost-model-picker-slider-max-fill"));
  const tickRail = element("span", "codexhost-model-picker-tick-rail");
  sliderTrack.append(sliderRange, tickRail);
  const thumbRail = element("span", "codexhost-model-picker-thumb-rail");
  thumbRail.setAttribute("aria-hidden", "true");
  const thumbScale = element("span", "codexhost-model-picker-thumb-scale");
  const thumbSpring = element("span", "codexhost-model-picker-thumb-spring");
  thumbSpring.append(element("span", "codexhost-model-picker-thumb"));
  thumbScale.append(thumbSpring);
  thumbRail.append(thumbScale);
  sliderRoot.append(sliderTrack, thumbRail);
  slider.append(sliderRoot);
  simpleView.append(sliderStatus, sliderInstructions, slider);
  sliderMotion.append(simpleView);
  simplePanel.append(topRowMotion, sliderMotion);
  simpleTrack.append(simplePanel);
  const listTrack = element("div", "codexhost-model-picker-track");
  const listPanel = element("div", "codexhost-model-picker-panel");
  const listMotion = element("div", "codexhost-model-picker-motion");
  listMotion.dataset.motion = "list";
  const modelList = element("div", "codexhost-model-picker-model-list");
  const listHeading = element("div", "codexhost-model-picker-section-label");
  listHeading.setAttribute("role", "presentation");
  const searchRow = element("div", "codexhost-model-picker-search");
  searchRow.hidden = true;
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  searchRow.append(
    createElement(Search, {
      width: 16,
      height: 16,
      "aria-hidden": "true",
      focusable: "false",
      "stroke-width": 1.75,
    }),
    searchInput,
  );
  const searchSeparator = element("div", "codexhost-model-picker-separator");
  searchSeparator.setAttribute("role", "separator");
  searchSeparator.hidden = true;
  const rows = element("div", "codexhost-model-picker-rows");
  rows.setAttribute("role", "group");
  const searchEmpty = element("div", "codexhost-model-picker-empty");
  searchEmpty.hidden = true;
  modelList.append(listHeading, searchRow, searchSeparator, rows, searchEmpty);
  listMotion.append(modelList);
  listPanel.append(listMotion);
  listTrack.append(listPanel);
  menu.append(simpleTrack, listTrack);
  popover.append(menu);
  document.body.append(popover);
  const sliderState: ThinkingSliderState = {
    options: [],
    signature: "",
    ticks: [],
    selectedIndex: -1,
    previewIndex: null,
    dragValue: null,
    pendingCommitId: null,
    keyTimer: void 0,
    drag: null,
    hoverIndex: null,
    thumbHovered: false,
    wheel: { accumulated: 0, last: 0 },
    disabled: true,
  };
  let resizeObserver: ResizeObserver | null = null;
  let transitionsFrame = 0;
  const pickerOpen = () => popoverOpen(popover);
  const sliderAvailable = () => sliderState.options.length >= 2;
  const displayIndex = () => {
    if (sliderState.previewIndex !== null) return sliderState.previewIndex;
    if (sliderState.pendingCommitId) {
      const pendingIndex = sliderState.options.findIndex(
        ({ id }) => id === sliderState.pendingCommitId,
      );
      if (pendingIndex >= 0) return pendingIndex;
    }
    return sliderState.selectedIndex;
  };
  const renderSlider = (animate = true) => {
    const options = sliderState.options;
    const steps = Math.max(options.length - 1, 1);
    const index = displayIndex();
    const continuous = sliderState.dragValue ?? Math.max(index, 0);
    const percent = Math.min(100, Math.max(0, (continuous / steps) * 100));
    const discrete = sliderState.dragValue === null ? index : Math.round(sliderState.dragValue);
    sliderRoot.dataset.animate = String(animate && sliderState.dragValue === null);
    thumbScale.style.left = modelPickerSliderLeft(percent);
    sliderRange.style.transform = modelPickerSliderRangeTransform(percent, steps);
    sliderState.ticks.forEach((tick, tickIndex) => {
      tick.dataset.selected = String(tickIndex <= discrete);
      tick.dataset.hovered = String(sliderState.hoverIndex === tickIndex);
    });
    if (sliderState.hoverIndex === null) delete sliderRoot.dataset.hoverIndex;
    else sliderRoot.dataset.hoverIndex = String(sliderState.hoverIndex);
    const maximum = isMaximumThinkingOption(options, discrete);
    sliderRoot.dataset.maximum = String(maximum);
    sliderRoot.dataset.disabled = String(sliderState.disabled);
    sliderRoot.dataset.thumbActive = String(
      !sliderState.disabled && (sliderState.thumbHovered || sliderState.drag !== null),
    );
    const option = options[discrete];
    syncRendererLabelText(viewEffortLabel, option?.label ?? "");
    viewEffortLabel.hidden = !option;
    viewEffortLabel.dataset.maximum = String(maximum);
    viewEffortLabel.dataset.powerDisabled = String(sliderState.disabled);
    viewControls.dataset.effortHeader = String(Boolean(option) && sliderAvailable());
    fastToggle.dataset.maximum = String(maximum);
    const messages = modelPickerMessages(control.locale);
    slider.setAttribute("aria-valuemin", "0");
    slider.setAttribute("aria-valuemax", String(Math.max(options.length - 1, 0)));
    slider.setAttribute("aria-valuenow", String(Math.max(discrete, 0)));
    if (option) slider.setAttribute("aria-valuetext", option.label);
    else slider.removeAttribute("aria-valuetext");
    slider.setAttribute("aria-disabled", String(sliderState.disabled));
    syncRendererLabelText(
      sliderStatus,
      option ? messages.thinkingValue(option.label, discrete + 1, options.length) : "",
    );
  };
  const setSliderOptions = (options: HarnessThinkingOption[]): void => {
    const signature = JSON.stringify(options.map(({ id, label: label2 }) => [id, label2]));
    if (signature === sliderState.signature) return;
    sliderState.signature = signature;
    sliderState.options = options;
    sliderState.previewIndex = null;
    sliderState.dragValue = null;
    sliderState.hoverIndex = null;
    const steps = Math.max(options.length - 1, 1);
    sliderState.ticks = options.map((option, index) => {
      const tick = element("span", "codexhost-model-picker-tick");
      tick.dataset.thinkingOptionId = option.id;
      tick.style.left = modelPickerSliderLeft((index / steps) * 100);
      return tick;
    });
    tickRail.replaceChildren(...sliderState.ticks);
  };
  const measure = (): void => {
    if (!pickerOpen()) return;
    const height =
      control.effectiveView === "advanced" ? listPanel.offsetHeight : simplePanel.offsetHeight;
    if (height > 0)
      menu.style.height = `min(${height}px, var(--codexhost-model-picker-available-height, 100vh))`;
  };
  const syncViewState = (): void => {
    const effective = sliderAvailable() ? control.menuView : "advanced";
    control.effectiveView = effective;
    menu.dataset.view = effective;
    const simpleActive = effective === "simple";
    topRowMotion.dataset.active = String(simpleActive);
    sliderMotion.dataset.active = String(simpleActive);
    listMotion.dataset.active = String(!simpleActive);
    simpleTrack.dataset.active = String(simpleActive);
    listTrack.dataset.active = String(!simpleActive);
    simpleTrack.inert = !simpleActive;
    listTrack.inert = simpleActive;
    simpleTrack.setAttribute("aria-hidden", String(!simpleActive));
    listTrack.setAttribute("aria-hidden", String(simpleActive));
  };
  const focusableItems = (): HTMLButtonElement[] =>
    [...control.options.values()]
      .filter(({ row, item }) => !row.hidden && !item.disabled)
      .map(({ item }) => item);
  const revealCheckedRow = (): void => {
    const checked = [...control.options.values()].find(
      ({ item }) => item.getAttribute("aria-checked") === "true",
    );
    if (!checked || checked.row.hidden) return;
    const rowTop = checked.row.offsetTop - rows.offsetTop;
    const rowBottom = rowTop + checked.row.offsetHeight;
    if (rowTop < rows.scrollTop) rows.scrollTop = rowTop;
    else if (rowBottom > rows.scrollTop + rows.clientHeight)
      rows.scrollTop = rowBottom - rows.clientHeight;
  };
  const focusList = (keyboard: boolean): void => {
    revealCheckedRow();
    if (!searchRow.hidden) {
      searchInput.focus({ preventScroll: true });
      return;
    }
    if (!keyboard) {
      popover.focus({ preventScroll: true });
      return;
    }
    const items = focusableItems();
    const checked = items.find((item) => item.getAttribute("aria-checked") === "true");
    (checked ?? items[0] ?? popover).focus({ preventScroll: true });
  };
  const focusActiveView = (keyboard = false): void => {
    if (!pickerOpen()) return;
    if (control.effectiveView === "simple") slider.focus({ preventScroll: true });
    else focusList(keyboard);
  };
  const setMenuView = (
    next: ModelPickerView,
    { focus = true, keyboard = false }: { focus?: boolean; keyboard?: boolean } = {},
  ): void => {
    control.menuView = next;
    syncViewState();
    if (next === "simple" && searchInput.value !== "") {
      searchInput.value = "";
      applyModelSearchFilter(control);
    }
    measure();
    if (focus) focusActiveView(keyboard);
  };
  const cancelKeyCommit = (): void => {
    if (sliderState.keyTimer !== void 0) window.clearTimeout(sliderState.keyTimer);
    sliderState.keyTimer = void 0;
  };
  const resolvePendingThinking = (optionId: string): void => {
    if (sliderState.pendingCommitId !== optionId) return;
    if (control.view?.status === "selecting") return;
    sliderState.pendingCommitId = null;
    renderSlider();
  };
  const commitThinking = (optionId: string): void => {
    cancelKeyCommit();
    sliderState.previewIndex = null;
    const option = sliderState.options.find(({ id }) => id === optionId);
    if (!option || sliderState.disabled) {
      renderSlider();
      return;
    }
    const current = sliderState.pendingCommitId ?? control.view?.selectedThinkingOptionId;
    if (option.id === current) {
      renderSlider();
      return;
    }
    sliderState.pendingCommitId = option.id;
    renderSlider();
    onSelectThinking(option.id);
    queueMicrotask(() => resolvePendingThinking(option.id));
  };
  const commitIndex = (index: number): void => {
    const option = sliderState.options[index];
    if (option) commitThinking(option.id);
    else {
      sliderState.previewIndex = null;
      renderSlider();
    }
  };
  const flushKeyCommit = (): void => {
    if (sliderState.keyTimer === void 0) return;
    cancelKeyCommit();
    if (sliderState.previewIndex !== null) commitIndex(sliderState.previewIndex);
  };
  const scheduleKeyCommit = (): void => {
    cancelKeyCommit();
    sliderState.keyTimer = window.setTimeout(() => {
      sliderState.keyTimer = void 0;
      if (sliderState.previewIndex !== null) commitIndex(sliderState.previewIndex);
    }, SLIDER_KEY_COMMIT_DELAY_MS);
  };
  const previewIndex = (index: number): void => {
    if (sliderState.disabled || !sliderAvailable()) return;
    const next = Math.max(0, Math.min(sliderState.options.length - 1, index));
    sliderState.previewIndex = next;
    renderSlider(true);
    scheduleKeyCommit();
  };
  const stepBy = (direction: number): void => {
    const current = Math.max(displayIndex(), 0);
    previewIndex(current + direction);
  };
  const endDrag = (): void => {
    const drag = sliderState.drag;
    if (!drag) return;
    sliderState.drag = null;
    try {
      if (sliderRoot.hasPointerCapture(drag.pointerId))
        sliderRoot.releasePointerCapture(drag.pointerId);
    } catch {}
    sliderRoot.dataset.pointerDown = "false";
    sliderRoot.dataset.dragging = "false";
  };
  const sliderGeometry = (): SliderGeometry => {
    const rect = sliderRoot.getBoundingClientRect();
    const scale = sliderRoot.offsetWidth > 0 ? rect.width / sliderRoot.offsetWidth : 1;
    const inset = SLIDER_THUMB_INSET * scale;
    return {
      start: rect.left + inset,
      width: Math.max(1, rect.width - inset * 2),
      scale,
      steps: Math.max(sliderState.options.length - 1, 1),
    };
  };
  const updateDrag = (clientX: number): void => {
    const drag = sliderState.drag;
    if (!drag) return;
    const ratio = Math.max(0, Math.min(1, (clientX - drag.thumbOffset - drag.start) / drag.width));
    const value = ratio * drag.steps;
    sliderState.previewIndex = Math.round(value);
    sliderState.dragValue = drag.continuous ? value : null;
    renderSlider(!drag.continuous);
  };
  const onSliderPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || sliderState.disabled || !sliderAvailable()) return;
    event.preventDefault();
    cancelKeyCommit();
    slider.focus({ preventScroll: true });
    slider.dataset.keyboardFocused = "false";
    const geometry = sliderGeometry();
    const current = Math.max(displayIndex(), 0);
    const thumbCenter = geometry.start + (current / geometry.steps) * geometry.width;
    const continuous =
      Math.abs(event.clientX - thumbCenter) <= SLIDER_THUMB_HIT_RADIUS * geometry.scale;
    sliderState.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      start: geometry.start,
      width: geometry.width,
      steps: geometry.steps,
      thumbOffset: continuous ? event.clientX - thumbCenter : 0,
      continuous,
      moved: false,
    };
    try {
      sliderRoot.setPointerCapture(event.pointerId);
    } catch {}
    sliderRoot.dataset.pointerDown = "true";
    sliderState.hoverIndex = null;
    if (!continuous) updateDrag(event.clientX);
    else renderSlider(false);
  };
  const onSliderPointerMove = (event: PointerEvent): void => {
    const drag = sliderState.drag;
    if (drag && event.pointerId === drag.pointerId) {
      if (
        !drag.moved &&
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >=
          SLIDER_DRAG_THRESHOLD
      ) {
        drag.moved = true;
        if (drag.continuous) sliderRoot.dataset.dragging = "true";
      }
      if (drag.moved || !drag.continuous) updateDrag(event.clientX);
      return;
    }
    if (sliderState.disabled || !sliderAvailable() || event.buttons !== 0) return;
    const geometry = sliderGeometry();
    const current = Math.max(displayIndex(), 0);
    const thumbCenter = geometry.start + (current / geometry.steps) * geometry.width;
    const thumbHovered =
      Math.abs(event.clientX - thumbCenter) <= SLIDER_THUMB_HIT_RADIUS * geometry.scale;
    let hoverIndex = null;
    if (!thumbHovered) {
      const nearest = Math.round(
        Math.max(0, Math.min(1, (event.clientX - geometry.start) / geometry.width)) *
          geometry.steps,
      );
      const tickX = geometry.start + (nearest / geometry.steps) * geometry.width;
      if (Math.abs(event.clientX - tickX) <= 8 * geometry.scale) hoverIndex = nearest;
    }
    if (thumbHovered !== sliderState.thumbHovered || hoverIndex !== sliderState.hoverIndex) {
      sliderState.thumbHovered = thumbHovered;
      sliderState.hoverIndex = hoverIndex;
      renderSlider();
    }
  };
  const onSliderPointerUp = (event: PointerEvent): void => {
    const drag = sliderState.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    endDrag();
    const index = sliderState.previewIndex ?? displayIndex();
    sliderState.dragValue = null;
    commitIndex(index);
  };
  const onSliderPointerCancel = (): void => {
    if (!sliderState.drag) return;
    endDrag();
    sliderState.dragValue = null;
    sliderState.previewIndex = null;
    renderSlider();
  };
  const onSliderPointerLeave = (): void => {
    if (sliderState.drag) return;
    if (sliderState.thumbHovered || sliderState.hoverIndex !== null) {
      sliderState.thumbHovered = false;
      sliderState.hoverIndex = null;
      renderSlider();
    }
  };
  const onSliderWheel = (event: WheelEvent): void => {
    if (event.ctrlKey || sliderState.disabled || !sliderAvailable()) return;
    event.preventDefault();
    event.stopPropagation();
    let delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : -event.deltaY;
    const invertedFromDevice = (
      event as WheelEvent & { webkitDirectionInvertedFromDevice?: boolean }
    ).webkitDirectionInvertedFromDevice;
    if (invertedFromDevice === true) delta *= -1;
    const step = event.deltaMode === 0 ? delta : Math.sign(delta) * SLIDER_WHEEL_STEP;
    if (step === 0) return;
    const wheel = sliderState.wheel;
    if (
      event.timeStamp - wheel.last > SLIDER_WHEEL_RESET_MS ||
      Math.sign(step) !== Math.sign(wheel.accumulated)
    ) {
      wheel.accumulated = 0;
    }
    wheel.last = event.timeStamp;
    wheel.accumulated += step;
    if (Math.abs(wheel.accumulated) < SLIDER_WHEEL_STEP) return;
    const direction = Math.sign(wheel.accumulated);
    wheel.accumulated -= direction * SLIDER_WHEEL_STEP;
    stepBy(direction);
  };
  const onSliderKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      close();
      trigger.focus();
      return;
    }
    if (sliderState.disabled || !sliderAvailable()) return;
    const last = sliderState.options.length - 1;
    let handled = true;
    if (event.key === "ArrowLeft" || event.key === "PageDown") stepBy(-1);
    else if (event.key === "ArrowRight" || event.key === "PageUp") stepBy(1);
    else if (event.key === "Home") previewIndex(0);
    else if (event.key === "End") previewIndex(last);
    else handled = false;
    if (!handled) return;
    event.preventDefault();
    event.stopPropagation();
    slider.dataset.keyboardFocused = "true";
  };
  const onSliderFocus = (): void => {
    let focusVisible = false;
    try {
      focusVisible = slider.matches(":focus-visible");
    } catch {}
    slider.dataset.keyboardFocused = String(focusVisible);
  };
  const onSliderBlur = (): void => {
    slider.dataset.keyboardFocused = "false";
    flushKeyCommit();
  };
  const close = ({ commitPending = true }: { commitPending?: boolean } = {}): void => {
    if (commitPending) flushKeyCommit();
    else {
      cancelKeyCommit();
      sliderState.previewIndex = null;
    }
    if (sliderState.drag) {
      endDrag();
      sliderState.dragValue = null;
      sliderState.previewIndex = null;
    }
    sliderState.thumbHovered = false;
    sliderState.hoverIndex = null;
    if (transitionsFrame) window.cancelAnimationFrame(transitionsFrame);
    transitionsFrame = 0;
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (pickerOpen()) popover.hidePopover();
    menu.dataset.transitionsReady = "false";
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("data-state", "closed");
    if (searchInput.value !== "") {
      searchInput.value = "";
      applyModelSearchFilter(control);
    }
    control.menuView = "simple";
  };
  const open = (keyboard = false): void => {
    if (trigger.disabled || pickerOpen()) return;
    selectionNotice.hide();
    control.favorites = readModelFavorites(control.harnessId);
    orderModelFavorites(control);
    control.menuView = "simple";
    const reducedMotion = modelPickerReducedMotion();
    popover.dataset.reducedMotion = String(reducedMotion);
    menu.dataset.reducedMotion = String(reducedMotion);
    menu.dataset.transitionsReady = "false";
    syncViewState();
    renderSlider(false);
    popover.showPopover();
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("data-state", "open");
    positionRendererModelPicker(control);
    measure();
    rows.scrollTop = 0;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => measure());
      resizeObserver.observe(simplePanel);
      resizeObserver.observe(listPanel);
    }
    transitionsFrame = window.requestAnimationFrame(() => {
      transitionsFrame = window.requestAnimationFrame(() => {
        transitionsFrame = 0;
        if (pickerOpen()) menu.dataset.transitionsReady = "true";
      });
    });
    focusActiveView(keyboard);
  };
  const onTriggerClick = (event: MouseEvent): void => {
    if (pickerOpen()) close();
    else open(event.detail === 0);
  };
  const onViewToggleClick = (event: MouseEvent): void => {
    event.preventDefault();
    if (viewToggle.disabled || viewToggle.dataset.interactive === "false") return;
    flushKeyCommit();
    setMenuView("advanced", { keyboard: event.detail === 0 });
  };
  const onFastToggleClick = (event: MouseEvent): void => {
    event.preventDefault();
    const next = control.fastNext;
    if (!next || fastToggle.disabled) return;
    flushKeyCommit();
    onSelectModel(next.id);
  };
  const onResetClick = (event: MouseEvent): void => {
    event.preventDefault();
    if (resetButton.disabled || !control.view) return;
    const view = control.view;
    const defaults = modelPickerDefaults(view);
    if (!defaults) return;
    cancelKeyCommit();
    sliderState.previewIndex = null;
    const selected = catalogModelForRef(view.catalog, view.selected);
    if (
      !selected ||
      selected.ref.id !== defaults.modelId ||
      view.selected?.id !== selected.ref.id
    ) {
      control.pendingReset = { modelId: defaults.modelId, thinkingId: defaults.thinkingId };
      control.pendingModelId = defaults.modelId;
      onSelectModel(defaults.modelId);
      queueMicrotask(() => {
        if (control.pendingModelId === defaults.modelId && control.view?.status !== "selecting") {
          control.pendingModelId = null;
          control.pendingReset = null;
          if (control.view)
            renderRendererModelPicker(
              control,
              control.view,
              true,
              control.harnessId,
              control.locale,
            );
        }
      });
      return;
    }
    if (defaults.thinkingId) commitThinking(defaults.thinkingId);
  };
  const onRowsClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    const favoriteButton = target?.closest<HTMLButtonElement>("button[data-favorite-model-id]");
    const favoriteId = favoriteButton?.dataset.favoriteModelId;
    if (favoriteId) {
      event.preventDefault();
      event.stopPropagation();
      control.favorites = readModelFavorites(control.harnessId);
      if (control.favorites.has(favoriteId)) control.favorites.delete(favoriteId);
      else control.favorites.add(favoriteId);
      writeModelFavorites(control.harnessId, control.favorites);
      const focused = document.activeElement;
      orderModelFavorites(control);
      if (focused instanceof HTMLElement && popover.contains(focused))
        focused.focus({ preventScroll: true });
      rows.scrollTop = 0;
      return;
    }
    const item = target?.closest<HTMLButtonElement>("button[data-model-id]");
    const modelId = item?.dataset.modelId;
    if (!item || !modelId || item.disabled || !control.view) return;
    event.preventDefault();
    const view = control.view;
    const selectedId = catalogModelForRef(view.catalog, view.selected)?.ref.id;
    if (modelId === selectedId && !control.pendingModelId) {
      if (sliderAvailable()) setMenuView("simple");
      else {
        close();
        trigger.focus();
      }
      return;
    }
    control.pendingModelId = modelId;
    control.pendingReset = null;
    setMenuView("simple", { focus: false });
    onSelectModel(modelId);
    queueMicrotask(() => {
      if (control.pendingModelId === modelId && control.view?.status !== "selecting") {
        control.pendingModelId = null;
        if (control.view)
          renderRendererModelPicker(control, control.view, true, control.harnessId, control.locale);
      }
    });
    if (pickerOpen()) focusActiveView();
  };
  const onSearchInput = (): void => {
    applyModelSearchFilter(control);
    rows.scrollTop = 0;
    measure();
  };
  const silencedEventTypes = [
    "keydown",
    "keypress",
    "keyup",
    "beforeinput",
    "input",
    "compositionstart",
    "compositionupdate",
    "compositionend",
    "change",
  ];
  const silenceForHarness = (event: Event): void => {
    event.stopPropagation();
  };
  const onSearchBlur = (): void => {
    if (!pickerOpen() || control.effectiveView !== "advanced") return;
    const active = document.activeElement;
    const movedToComposer =
      active === document.body ||
      (active instanceof Element &&
        (active.matches('textarea, [contenteditable="true"], [role="textbox"]') ||
          active.closest('textarea, [contenteditable="true"], [role="textbox"]') !== null));
    if (!movedToComposer) return;
    requestAnimationFrame(() => {
      if (
        pickerOpen() &&
        searchInput.isConnected &&
        !searchRow.hidden &&
        !popover.contains(document.activeElement)
      ) {
        searchInput.focus({ preventScroll: true });
      }
    });
  };
  const activeFocusables = (): HTMLElement[] => {
    if (control.effectiveView === "advanced") {
      const items = [];
      if (!searchRow.hidden) items.push(searchInput);
      for (const option of control.options.values()) {
        if (option.row.hidden) continue;
        if (!option.item.disabled) items.push(option.item);
        items.push(option.favorite);
      }
      return items;
    }
    return [viewToggle, fastToggle, resetButton, slider].filter(
      (candidate) =>
        !candidate.hidden &&
        !(candidate instanceof HTMLButtonElement && candidate.disabled) &&
        candidate.dataset.interactive !== "false",
    );
  };
  const onPopoverKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      trigger.focus();
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (event.key === "Tab") {
      const focusables = activeFocusables();
      if (focusables.length > 0) {
        const index = target === null ? -1 : focusables.indexOf(target);
        const next = event.shiftKey
          ? index <= 0
            ? focusables.length - 1
            : index - 1
          : index === -1 || index >= focusables.length - 1
            ? 0
            : index + 1;
        focusables[next]?.focus({ preventScroll: false });
        event.preventDefault();
      }
      event.stopPropagation();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const candidates =
        control.effectiveView === "advanced"
          ? [...(searchRow.hidden ? [] : [searchInput]), ...focusableItems()]
          : activeFocusables();
      if (candidates.length > 0) {
        const index = target === null ? -1 : candidates.indexOf(target);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next =
          index === -1
            ? delta > 0
              ? 0
              : candidates.length - 1
            : (index + delta + candidates.length) % candidates.length;
        candidates[next]?.focus({ preventScroll: false });
        candidates[next]?.scrollIntoView?.({ block: "nearest" });
        event.preventDefault();
      }
      event.stopPropagation();
      return;
    }
    if (event.key === "Enter" && target === searchInput) {
      const first = focusableItems()[0];
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
    event.stopPropagation();
  };
  const onDocumentPointerDown = (event: PointerEvent): void => {
    if (!pickerOpen()) return;
    const target = event.target instanceof Node ? event.target : null;
    if (target && (root.contains(target) || popover.contains(target))) return;
    close();
  };
  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !pickerOpen()) return;
    event.preventDefault();
    close();
    trigger.focus();
  };
  const onViewportChange = (event: Event): void => {
    if (!pickerOpen()) return;
    if (event?.type === "scroll" && event.target instanceof Node && popover.contains(event.target))
      return;
    positionRendererModelPicker(control);
    measure();
  };
  trigger.addEventListener("click", onTriggerClick);
  viewToggle.addEventListener("click", onViewToggleClick);
  fastToggle.addEventListener("click", onFastToggleClick);
  resetButton.addEventListener("click", onResetClick);
  rows.addEventListener("click", onRowsClick);
  searchInput.addEventListener("input", onSearchInput);
  for (const type of silencedEventTypes) searchInput.addEventListener(type, silenceForHarness);
  searchInput.addEventListener("keydown", onPopoverKeyDown);
  searchInput.addEventListener("blur", onSearchBlur);
  slider.addEventListener("keydown", onSliderKeyDown);
  slider.addEventListener("focus", onSliderFocus);
  slider.addEventListener("blur", onSliderBlur);
  sliderRoot.addEventListener("pointerdown", onSliderPointerDown);
  sliderRoot.addEventListener("pointermove", onSliderPointerMove);
  sliderRoot.addEventListener("pointerup", onSliderPointerUp);
  sliderRoot.addEventListener("pointercancel", onSliderPointerCancel);
  sliderRoot.addEventListener("lostpointercapture", onSliderPointerCancel);
  sliderRoot.addEventListener("pointerleave", onSliderPointerLeave);
  sliderRoot.addEventListener("wheel", onSliderWheel, { passive: false });
  popover.addEventListener("keydown", onPopoverKeyDown);
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  document.addEventListener("keydown", onDocumentKeyDown, true);
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
  const control: RendererModelPickerControl = {
    root,
    trigger,
    label,
    thinkingLabel,
    fastMark,
    errorMark,
    selectionNotice,
    lastSelectionErrorId: latestPresentedSelectionErrorId,
    popover,
    menu,
    simplePanel,
    listPanel,
    viewControls,
    viewToggle,
    viewModelLabel,
    viewEffortLabel,
    fastToggle,
    resetButton,
    slider,
    sliderRoot,
    sliderInstructions,
    listHeading,
    searchRow,
    searchInput,
    searchSeparator,
    searchEmpty,
    rows,
    harnessId: "",
    locale: "en",
    favorites: /* @__PURE__ */ new Set(),
    options: /* @__PURE__ */ new Map(),
    modelsSignature: null,
    menuView: "simple",
    effectiveView: "simple",
    view: void 0,
    fastNext: void 0,
    pendingModelId: null,
    pendingReset: null,
    sliderState,
    setSliderOptions,
    renderSlider,
    syncViewState,
    measure,
    commitThinking,
    focusActiveView,
    isOpen: pickerOpen,
    open,
    close,
    dispose() {
      close({ commitPending: false });
      selectionNotice.dispose();
      trigger.removeEventListener("click", onTriggerClick);
      viewToggle.removeEventListener("click", onViewToggleClick);
      fastToggle.removeEventListener("click", onFastToggleClick);
      resetButton.removeEventListener("click", onResetClick);
      rows.removeEventListener("click", onRowsClick);
      searchInput.removeEventListener("input", onSearchInput);
      for (const type of silencedEventTypes)
        searchInput.removeEventListener(type, silenceForHarness);
      searchInput.removeEventListener("keydown", onPopoverKeyDown);
      searchInput.removeEventListener("blur", onSearchBlur);
      slider.removeEventListener("keydown", onSliderKeyDown);
      slider.removeEventListener("focus", onSliderFocus);
      slider.removeEventListener("blur", onSliderBlur);
      sliderRoot.removeEventListener("pointerdown", onSliderPointerDown);
      sliderRoot.removeEventListener("pointermove", onSliderPointerMove);
      sliderRoot.removeEventListener("pointerup", onSliderPointerUp);
      sliderRoot.removeEventListener("pointercancel", onSliderPointerCancel);
      sliderRoot.removeEventListener("lostpointercapture", onSliderPointerCancel);
      sliderRoot.removeEventListener("pointerleave", onSliderPointerLeave);
      sliderRoot.removeEventListener("wheel", onSliderWheel);
      popover.removeEventListener("keydown", onPopoverKeyDown);
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
      document.removeEventListener("keydown", onDocumentKeyDown, true);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      popover.remove();
      root.remove();
    },
  };
  syncRendererModelTriggerClass(control);
  return control;
}
function syncModelPickerStaticText(
  control: RendererModelPickerControl,
  locale: RendererSettingsLocale,
): void {
  const messages = modelPickerMessages(locale);
  control.popover.setAttribute("aria-label", messages.selectModel);
  syncRendererLabelText(control.listHeading, messages.selectModel);
  control.searchInput.placeholder = messages.searchModels;
  control.searchInput.setAttribute("aria-label", messages.searchModels);
  syncRendererLabelText(control.searchEmpty, messages.noMatchingModels);
  control.viewToggle.setAttribute("aria-label", messages.selectModel);
  control.viewToggle.title = messages.selectModel;
  control.resetButton.setAttribute("aria-label", messages.resetToDefault);
  control.resetButton.title = messages.resetToDefault;
  control.slider.setAttribute("aria-label", messages.thinking);
  syncRendererLabelText(control.sliderInstructions, messages.thinkingInstructions);
}
function syncModelPickerContent(
  control: RendererModelPickerControl,
  view: RendererModelControlView,
  presentation: RendererModelPickerPresentation,
): void {
  const disabled = isRendererModelPickerDisabled(view);
  const models = view.catalog?.models ?? [];
  const modelsSignature = JSON.stringify(
    models.map((model2) => [model2.ref.id, model2.label, model2.resolvedModelLabel ?? null]),
  );
  if (modelsSignature !== control.modelsSignature) {
    rebuildModelRows(control, models);
    control.modelsSignature = modelsSignature;
  }
  const selectedCatalogModel = catalogModelForRef(view.catalog, view.selected);
  const selectedModelId = selectedCatalogModel?.ref.id;
  const pendingModelId = view.status === "selecting" ? control.pendingModelId : null;
  const checkedModelId = pendingModelId ?? selectedModelId;
  for (const [modelId, option] of control.options) {
    const checked = modelId === checkedModelId;
    option.item.setAttribute("aria-checked", String(checked));
    option.check.style.display = checked ? "" : "none";
    option.item.disabled = disabled;
    option.row.dataset.disabled = String(disabled);
  }
  const showSearch = models.length > MODEL_PICKER_SEARCH_THRESHOLD;
  control.searchRow.hidden = !showSearch;
  control.searchSeparator.hidden = !showSearch;
  control.searchInput.disabled = disabled;
  if (!showSearch && control.searchInput.value !== "") control.searchInput.value = "";
  applyModelSearchFilter(control);
  const orderedThinking = orderedThinkingOptions(presentation.thinkingOptions);
  control.setSliderOptions(orderedThinking);
  control.sliderState.selectedIndex = orderedThinking.findIndex(
    ({ id }) => id === view.selectedThinkingOptionId,
  );
  control.sliderState.disabled = disabled || !presentation.thinkingSelectionEnabled;
  if (control.sliderState.disabled && control.sliderState.drag === null)
    control.sliderState.previewIndex = null;
  const pendingModelLabel = pendingModelId ? control.options.get(pendingModelId)?.label : void 0;
  const modelLabel = pendingModelLabel ?? presentation.modelLabel;
  syncRendererLabelText(control.viewModelLabel, modelLabel);
  control.viewModelLabel.title = presentation.resolvedModelLabel
    ? `${modelLabel} (${presentation.resolvedModelLabel})`
    : modelLabel;
  control.viewToggle.dataset.interactive = String(models.length > 1);
  control.viewToggle.disabled = disabled;
  const fastAvailable = selectedCatalogModel?.fastModel !== void 0;
  const fastEnabled = fastAvailable && selectedCatalogModel?.fastModel?.id === view.selected?.id;
  control.fastNext = fastAvailable
    ? fastEnabled
      ? selectedCatalogModel.ref
      : selectedCatalogModel.fastModel
    : void 0;
  control.fastToggle.hidden = !fastAvailable;
  control.fastToggle.disabled = disabled;
  control.fastToggle.dataset.fastEnabled = String(fastEnabled);
  control.fastToggle.setAttribute("aria-checked", String(fastEnabled));
  const messages = modelPickerMessages(control.locale);
  const fastLabel = `${fastEnabled ? messages.fastOn : messages.fastOff}
${messages.fastDetail}`;
  control.fastToggle.setAttribute("aria-label", fastEnabled ? messages.fastOn : messages.fastOff);
  control.fastToggle.title = fastLabel;
  control.resetButton.hidden = control.pendingReset === null && !modelPickerResetAvailable(view);
  control.resetButton.disabled = disabled;
  control.syncViewState();
  control.renderSlider(control.isOpen() && control.menu.dataset.transitionsReady === "true");
  control.measure();
}
function resolveModelPickerPendingSelections(
  control: RendererModelPickerControl,
  view: RendererModelControlView,
): void {
  if (
    view.status === "selecting" ||
    view.status === "loading" ||
    view.status === "waitingForAdapter"
  )
    return;
  if (control.sliderState.pendingCommitId) {
    control.sliderState.pendingCommitId = null;
    control.renderSlider(control.isOpen());
  }
  const requestedModelId = control.pendingModelId;
  const reset = control.pendingReset;
  control.pendingModelId = null;
  control.pendingReset = null;
  if (!requestedModelId) return;
  const selectedModelId = catalogModelForRef(view.catalog, view.selected)?.ref.id;
  if (view.status === "error" || selectedModelId !== requestedModelId) {
    control.resetButton.hidden = !modelPickerResetAvailable(view);
    return;
  }
  const resetThinkingId = reset?.thinkingId;
  if (
    resetThinkingId !== undefined &&
    view.selectedThinkingOptionId !== resetThinkingId &&
    control.sliderState.options.some(({ id }) => id === resetThinkingId)
  ) {
    queueMicrotask(() => {
      if (resetThinkingId === undefined) return;
      if (control.view === view && !isRendererModelPickerDisabled(view))
        control.commitThinking(resetThinkingId);
    });
    return;
  }
  control.resetButton.hidden = !modelPickerResetAvailable(view);
  if (!control.isOpen()) return;
  if (control.sliderState.options.length < 2) {
    control.close();
    control.trigger.focus();
    return;
  }
  if (!control.popover.contains(document.activeElement)) control.focusActiveView();
}
function syncModelPickerSelectionNotice(
  control: RendererModelPickerControl,
  view: RendererModelControlView,
  locale: RendererSettingsLocale,
): void {
  if (!rendererModelSelectionFailed(view)) {
    control.selectionNotice.hide();
    return;
  }
  if (!shouldOpenRendererModelSelectionNotice(view, control.lastSelectionErrorId)) {
    control.selectionNotice.reposition();
    return;
  }
  control.lastSelectionErrorId = view.selectionErrorId;
  latestPresentedSelectionErrorId = Math.max(
    latestPresentedSelectionErrorId,
    view.selectionErrorId,
  );
  if (control.isOpen()) control.close();
  const content = rendererModelSelectionNoticeContent(view, locale);
  control.selectionNotice.show(content.heading, content.message);
}
export function renderRendererModelPicker(
  control: RendererModelPickerControl,
  view: RendererModelControlView,
  visible: boolean,
  harnessId = "",
  locale: RendererSettingsLocale = "en",
): void {
  if (control.harnessId !== harnessId) {
    control.close({ commitPending: false });
    control.selectionNotice.hide();
    control.harnessId = harnessId;
    control.favorites = readModelFavorites(harnessId);
    control.modelsSignature = null;
    control.pendingModelId = null;
    control.pendingReset = null;
    control.sliderState.pendingCommitId = null;
    control.sliderState.previewIndex = null;
  }
  const localeChanged = control.locale !== locale;
  control.locale = locale;
  control.view = view;
  control.root.style.display = visible ? "inline-flex" : "none";
  control.root.style.alignItems = "center";
  control.root.style.alignSelf = "center";
  control.root.style.height = "28px";
  control.root.style.verticalAlign = "middle";
  applyRendererTriggerChipSqueezeRoot(control.root, rendererModelTriggerMaxWidth());
  if (!visible) {
    control.close({ commitPending: false });
    control.selectionNotice.hide();
    return;
  }
  if (localeChanged || control.modelsSignature === null) syncModelPickerStaticText(control, locale);
  const presentation = rendererModelPickerPresentation(view, locale);
  const keepOpenContent = control.isOpen() && isTransientPickerState(view);
  syncRendererLabelText(control.label, presentation.modelLabel);
  control.label.title = presentation.modelLabel;
  const secondaryLabel = presentation.thinkingLabel ?? presentation.resolvedModelLabel;
  syncRendererLabelText(control.thinkingLabel, secondaryLabel ?? "");
  control.thinkingLabel.hidden = secondaryLabel === void 0;
  const selectedThinking = presentation.thinkingLabel
    ? presentation.thinkingOptions.find(({ id }) => id === view.selectedThinkingOptionId)
    : void 0;
  control.thinkingLabel.dataset.maximum = String(
    selectedThinking !== void 0 && thinkingOptionRank(selectedThinking) === 7,
  );
  const selectedCatalogModel = catalogModelForRef(view.catalog, view.selected);
  const fastEnabled =
    selectedCatalogModel?.fastModel !== void 0 &&
    selectedCatalogModel.fastModel.id === view.selected?.id;
  control.fastMark.style.display = fastEnabled ? "" : "none";
  const accessibleLabel = secondaryLabel
    ? `${presentation.modelLabel}, ${secondaryLabel}`
    : presentation.modelLabel;
  control.trigger.title = view.error ?? accessibleLabel;
  const selectionFailed = rendererModelSelectionFailed(view);
  control.errorMark.hidden = !selectionFailed;
  control.trigger.setAttribute(
    "aria-label",
    selectionFailed ? `Model: ${accessibleLabel}: ${view.error}` : `Model: ${accessibleLabel}`,
  );
  control.trigger.setAttribute(
    "aria-busy",
    String(view.status === "loading" || view.status === "selecting"),
  );
  control.trigger.disabled = isRendererModelPickerDisabled(view);
  if (keepOpenContent) {
    for (const option of control.options.values()) option.item.disabled = true;
    control.sliderState.disabled = true;
    control.renderSlider();
  } else {
    if (
      view.status !== "selecting" &&
      view.status !== "loading" &&
      view.status !== "waitingForAdapter"
    ) {
      control.sliderState.pendingCommitId = null;
    }
    syncModelPickerContent(control, view, presentation);
  }
  if (shouldCloseRendererModelPicker(view) && !keepOpenContent) control.close();
  resolveModelPickerPendingSelections(control, view);
  syncModelPickerSelectionNotice(control, view, locale);
}
