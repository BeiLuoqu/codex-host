import type { HarnessThinkingOption } from "@codexhost/shared-contracts";

import type { RendererSettingsLocale } from "./settings/localization.js";

export const SLIDER_THUMB_INSET = 13;
export const SLIDER_THUMB_HIT_RADIUS = 14;
export const SLIDER_DRAG_THRESHOLD = 4;
export const SLIDER_KEY_COMMIT_DELAY_MS = 320;
export const SLIDER_WHEEL_STEP = 30;
export const SLIDER_WHEEL_RESET_MS = 160;

export interface RendererModelPickerMessages {
  selectModel: string;
  searchModels: string;
  noMatchingModels: string;
  resetToDefault: string;
  thinking: string;
  thinkingInstructions: string;
  thinkingValue(value: string, position: number, total: number): string;
  favorite(model: string): string;
  unfavorite(model: string): string;
  fastOn: string;
  fastOff: string;
  fastDetail: string;
  loadingModels: string;
  selecting: string;
  noModels: string;
  modelsUnavailable: string;
}

const MESSAGES: Readonly<Record<"en" | "zh", RendererModelPickerMessages>> = Object.freeze({
  en: Object.freeze({
    selectModel: "Select model",
    searchModels: "Search models",
    noMatchingModels: "No matching models",
    resetToDefault: "Reset to default",
    thinking: "Thinking",
    thinkingInstructions: "Use Left and Right arrow keys to adjust thinking",
    thinkingValue: (value: string, position: number, total: number) =>
      `${value}, ${position} of ${total}.`,
    favorite: (model: string) => `Favorite ${model}`,
    unfavorite: (model: string) => `Unfavorite ${model}`,
    fastOn: "Fast is on \xB7 Click to disable",
    fastOff: "Fast is off \xB7 Click to enable",
    fastDetail: "Fast mode prioritizes requests and may increase usage.",
    loadingModels: "Loading models...",
    selecting: "Selecting...",
    noModels: "No models",
    modelsUnavailable: "Models unavailable",
  }),
  zh: Object.freeze({
    selectModel: "选择模型",
    searchModels: "搜索模型",
    noMatchingModels: "没有匹配的模型",
    resetToDefault: "恢复默认",
    thinking: "思考强度",
    thinkingInstructions: "使用左右方向键调整思考强度",
    thinkingValue: (value: string, position: number, total: number) =>
      `${value}，第 ${position} 项，共 ${total} 项。`,
    favorite: (model: string) => `收藏 ${model}`,
    unfavorite: (model: string) => `取消收藏 ${model}`,
    fastOn: "Fast 已开启 \xB7 点击关闭",
    fastOff: "Fast 已关闭 \xB7 点击开启",
    fastDetail: "Fast 模式：优先处理请求，可能增加额度消耗。",
    loadingModels: "正在加载模型…",
    selecting: "正在选择…",
    noModels: "没有可用模型",
    modelsUnavailable: "无法加载模型",
  }),
});
export function modelPickerMessages(locale: RendererSettingsLocale): RendererModelPickerMessages {
  return locale === "zh-CN" ? MESSAGES.zh : MESSAGES.en;
}

const THINKING_OPTION_RANKS = new Map<string, number>([
  ["off", 0],
  ["none", 0],
  ["disabled", 0],
  ["no-thinking", 0],
  ["minimal", 1],
  ["min", 1],
  ["lowest", 1],
  ["low", 2],
  ["light", 2],
  ["medium", 3],
  ["med", 3],
  ["moderate", 3],
  ["normal", 3],
  ["high", 4],
  ["xhigh", 5],
  ["x-high", 5],
  ["extra-high", 5],
  ["very-high", 5],
  ["higher", 5],
  ["max", 6],
  ["maximum", 6],
  ["highest", 6],
  ["ultra", 7],
  ["ultracode", 7],
]);
export function thinkingOptionRank(option: HarnessThinkingOption | undefined): number | undefined {
  for (const value of [option?.id, option?.label]) {
    const key = String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/gu, "-");
    if (THINKING_OPTION_RANKS.has(key)) return THINKING_OPTION_RANKS.get(key);
  }
  return void 0;
}
export function orderedThinkingOptions(options: HarnessThinkingOption[]): HarnessThinkingOption[] {
  const ranks = options.map(thinkingOptionRank).filter((rank) => rank !== void 0);
  if (ranks.length < 2) return [...options];
  const descending = ranks.every((rank, index) => index === 0 || rank < (ranks[index - 1] ?? rank));
  return descending ? [...options].reverse() : [...options];
}
export function isMaximumThinkingOption(options: HarnessThinkingOption[], index: number): boolean {
  const last = options.length - 1;
  if (last < 1 || index !== last) return false;
  const rank = thinkingOptionRank(options[last]);
  return rank === void 0 ? options.length >= 4 : rank >= 5;
}
export function modelPickerSliderInset(percent: number): number {
  return SLIDER_THUMB_INSET - (percent / 50) * SLIDER_THUMB_INSET;
}
export function modelPickerSliderLeft(percent: number): string {
  return `calc(${percent}% + ${modelPickerSliderInset(percent)}px)`;
}
export function modelPickerSliderRangeTransform(percent: number, steps: number): string {
  if (steps <= 0) return "translateX(-100%)";
  const stepPercent = 100 / steps;
  const factor = Math.max(0, Math.min(percent / stepPercent, (100 - percent) / stepPercent, 1));
  return `translateX(calc(${percent - 100}% + ${modelPickerSliderInset(percent) * factor}px))`;
}
