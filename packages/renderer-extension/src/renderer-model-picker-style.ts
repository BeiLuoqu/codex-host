const STYLE_ATTRIBUTE = "data-codexhost-model-picker-style";
const STYLE_VERSION = "2026-10-24.1";

/** Styles the Codex-style picker; Codex theme tokens keep both themes consistent. */
export function rendererModelPickerStyleText(): string {
  return `  [data-codexhost-model-picker] [hidden],
  [data-codexhost-model-picker-trigger] [hidden] {
    display: none !important;
  }
  button.codexhost-trigger-chip[data-codexhost-model-picker-trigger] {
    height: 28px;
    padding: 0 8px;
    gap: 4px;
    font-family: inherit;
    font-weight: inherit;
    font-size: var(--text-sm, 13px);
    line-height: 18px;
    letter-spacing: 0;
    color: var(--color-text-tertiary, #8f8f8f);
  }
  button.codexhost-trigger-chip[data-codexhost-model-picker-trigger]:hover:not(:disabled),
  button.codexhost-trigger-chip[data-codexhost-model-picker-trigger][data-state="open"] {
    background: var(--color-background-primary-ghost-hover, rgba(127, 127, 127, 0.08));
  }
  button.codexhost-trigger-chip[data-codexhost-model-picker-trigger]:active:not(:disabled) {
    background: var(--color-background-primary-ghost-hover, rgba(127, 127, 127, 0.08));
  }
  button.codexhost-trigger-chip[data-codexhost-model-picker-trigger]:focus {
    outline: none;
  }
  button.codexhost-trigger-chip[data-codexhost-model-picker-trigger]:focus-visible {
    box-shadow: 0 0 0 2px var(--color-ring, #3a83f7);
  }
  .codexhost-model-picker-trigger-model {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text, inherit);
  }
  .codexhost-model-picker-trigger-effort {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-tertiary, #8f8f8f);
  }
  .codexhost-model-picker-trigger-effort[data-maximum="true"] {
    color: var(--color-chart-purple, #924ff7);
  }
  .codexhost-model-picker-trigger-icon {
    flex: none;
    color: var(--color-text, inherit);
  }
  .codexhost-model-picker-trigger-error {
    display: inline-flex;
    flex: none;
    align-items: center;
    color: var(--color-text-danger, #c2413b);
  }
  .codexhost-model-picker-trigger-chevron {
    flex: none;
    color: var(--color-text-tertiary, #8f8f8f);
  }
  .codexhost-model-picker-popover {
    position: fixed;
    inset: auto;
    box-sizing: border-box;
    width: calc(var(--spacing, 4px) * 63.5);
    max-width: calc(100vw - 16px);
    margin: 0;
    padding: 0;
    border: 0;
    overflow: hidden;
    color: var(--color-text, CanvasText);
    font-size: var(--text-sm, 13px);
    line-height: var(--text-sm--line-height, 1.4286);
    letter-spacing: 0;
    text-align: start;
    border-radius: var(--radius-2xl, 16px);
    background-color: var(--model-picker-background, color-mix(in oklab, var(--color-surface-elevated-secondary, Canvas) 90%, transparent));
    box-shadow:
      0 0 0 var(--model-picker-ring-width, 0.5px) var(--color-border-overlay, var(--color-border, rgba(0, 0, 0, 0.08))),
      var(--model-picker-overlay-shadow, var(--shadow-xl-spread, 0 8px 16px -4px rgba(0, 0, 0, 0.12)));
    -webkit-backdrop-filter: blur(var(--blur-sm, 8px));
    backdrop-filter: blur(var(--blur-sm, 8px));
    transform-origin: var(--codexhost-model-picker-origin, 50% 100%);
    user-select: none;
    outline: none;
    will-change: opacity, transform;
  }
  .codexhost-model-picker-popover:popover-open {
    animation: codexhost-model-picker-enter 0.32s cubic-bezier(0.23, 1, 0.32, 1) 30ms both;
  }
  .codexhost-model-picker-popover[data-reduced-motion="true"]:popover-open {
    animation: none;
  }
  @keyframes codexhost-model-picker-enter {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  .codexhost-model-picker-menu {
    position: relative;
    flex-shrink: 0;
  }
  .codexhost-model-picker-menu[data-transitions-ready="true"] {
    transition: height 0.32s cubic-bezier(0.19, 1, 0.22, 1);
  }
  .codexhost-model-picker-menu[data-transitions-ready="true"] .codexhost-model-picker-motion {
    transition:
      opacity 0.2s cubic-bezier(0.23, 1, 0.32, 1),
      translate 0.32s cubic-bezier(0.19, 1, 0.22, 1);
  }
  .codexhost-model-picker-menu[data-transitions-ready="true"] .codexhost-model-picker-motion[data-motion="top-row"][data-active="true"] {
    transition-delay: 56ms;
  }
  .codexhost-model-picker-menu[data-transitions-ready="true"] .codexhost-model-picker-motion[data-motion="slider"][data-active="true"],
  .codexhost-model-picker-menu[data-transitions-ready="true"] .codexhost-model-picker-motion[data-motion="list"][data-active="true"] {
    transition-delay: 40ms;
  }
  .codexhost-model-picker-menu[data-transitions-ready="true"] .codexhost-model-picker-motion[data-motion="slider"][data-active="false"] {
    transition-delay: 16ms;
  }
  .codexhost-model-picker-menu[data-reduced-motion="true"],
  .codexhost-model-picker-menu[data-reduced-motion="true"] .codexhost-model-picker-motion {
    transition: none !important;
  }
  .codexhost-model-picker-track {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: clip;
  }
  .codexhost-model-picker-track:last-child {
    position: absolute;
    inset-block-start: 0;
    inset-inline: 0;
  }
  .codexhost-model-picker-panel {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: 100%;
    padding: var(--spacing, 4px);
  }
  .codexhost-model-picker-motion {
    opacity: 1;
    translate: 0;
  }
  .codexhost-model-picker-motion[data-active="false"] {
    opacity: 0;
  }
  .codexhost-model-picker-motion[data-motion="top-row"][data-active="false"],
  .codexhost-model-picker-motion[data-motion="slider"][data-active="false"] {
    translate: 0 -10px;
  }
  .codexhost-model-picker-motion[data-motion="list"] {
    margin-inline: calc(-1 * var(--spacing, 4px));
  }
  .codexhost-model-picker-motion[data-motion="list"][data-active="false"] {
    translate: 0 10px;
  }
  .codexhost-model-picker-view-controls {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-height: 36px;
    padding-inline: calc(var(--spacing, 4px) * 8);
  }
  .codexhost-model-picker-view-toggle,
  .codexhost-model-picker-icon-button,
  .codexhost-model-picker-item,
  .codexhost-model-picker-favorite {
    appearance: none;
    margin: 0;
    border: 0;
    background: transparent;
    font: inherit;
    letter-spacing: 0;
    text-align: inherit;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }
  .codexhost-model-picker-view-toggle {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
    max-width: 100%;
    min-height: 32px;
    padding: 4px;
    border-radius: 8px;
    color: var(--color-text, inherit);
    font-size: var(--text-base, 14px);
    font-weight: 500;
    line-height: var(--text-sm--line-height, 1.4286);
    cursor: var(--cursor-interaction, pointer);
  }
  .codexhost-model-picker-view-toggle[data-interactive="false"] {
    pointer-events: none;
    cursor: default;
  }
  .codexhost-model-picker-view-toggle[data-interactive="false"] .codexhost-model-picker-view-toggle-icon {
    opacity: 0;
  }
  .codexhost-model-picker-view-toggle-content {
    display: grid;
    grid-template-rows: 1lh calc(var(--text-xs, 12px) * var(--text-xs--line-height, 1.3333));
    grid-template-columns: minmax(calc(var(--spacing, 4px) * 4), 1fr) minmax(0, auto) minmax(calc(var(--spacing, 4px) * 4), 1fr);
    align-items: center;
    gap: 0;
    box-sizing: border-box;
    min-width: 0;
    max-width: 100%;
    padding: 2px 4px;
    border-radius: 6px;
  }
  .codexhost-model-picker-view-toggle:not(:disabled):hover .codexhost-model-picker-view-toggle-content,
  .codexhost-model-picker-view-toggle:not(:disabled):focus-visible .codexhost-model-picker-view-toggle-content {
    background: var(--color-background-primary-ghost-hover, rgba(127, 127, 127, 0.08));
  }
  .codexhost-model-picker-effort-label {
    grid-area: 1 / 1 / 2 / -1;
    justify-self: center;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
    color: var(--color-chart-blue, #3a83f7);
  }
  .codexhost-model-picker-effort-label[data-maximum="true"] {
    color: var(--color-chart-purple, #924ff7);
  }
  .codexhost-model-picker-effort-label[data-power-disabled="true"] {
    color: var(--color-text-secondary, #6b6b6b);
  }
  .codexhost-model-picker-model-label {
    grid-area: 2 / 2;
    justify-self: center;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-secondary, #6b6b6b);
    font-size: var(--text-xs, 12px);
    font-weight: 400;
    line-height: var(--text-xs--line-height, 1.3333);
  }
  .codexhost-model-picker-view-toggle-icon {
    grid-area: 2 / 3;
    color: var(--color-text-tertiary, #8f8f8f);
  }
  .codexhost-model-picker-view-controls[data-effort-header="false"] .codexhost-model-picker-model-label,
  .codexhost-model-picker-view-controls[data-effort-header="false"] .codexhost-model-picker-view-toggle-icon {
    grid-row: 1 / -1;
  }
  .codexhost-model-picker-view-controls[data-effort-header="false"] .codexhost-model-picker-model-label {
    color: var(--color-text, inherit);
    font-size: var(--text-sm, 13px);
    font-weight: 500;
  }
  .codexhost-model-picker-icon-button {
    position: absolute;
    inset-block-start: 0;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    justify-content: center;
    width: 32px;
    min-height: 32px;
    padding: 0;
    border-radius: 8px;
    color: var(--color-text-tertiary, #8f8f8f);
    cursor: var(--cursor-interaction, pointer);
  }
  .codexhost-model-picker-icon-button[data-position="start"] {
    inset-inline-start: 0;
  }
  .codexhost-model-picker-icon-button[data-position="end"] {
    inset-inline-end: 0;
  }
  .codexhost-model-picker-icon-button:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .codexhost-model-picker-icon-button-content {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    margin-inline: auto;
    border-radius: 7px;
  }
  .codexhost-model-picker-icon-button:not(:disabled):hover .codexhost-model-picker-icon-button-content,
  .codexhost-model-picker-icon-button:not(:disabled):focus-visible .codexhost-model-picker-icon-button-content {
    background: var(--color-background-primary-ghost-hover, rgba(127, 127, 127, 0.08));
  }
  .codexhost-model-picker-icon-button[data-fast-enabled="true"] {
    color: var(--color-chart-blue, #3a83f7);
  }
  .codexhost-model-picker-icon-button[data-fast-enabled="true"][data-maximum="true"] {
    color: var(--color-chart-purple, #924ff7);
  }
  .codexhost-model-picker-icon-button[data-fast-enabled="true"] .codexhost-model-picker-fast-off,
  .codexhost-model-picker-icon-button:not([data-fast-enabled="true"]) .codexhost-model-picker-fast-on {
    display: none;
  }
  .codexhost-model-picker-simple-view {
    display: grid;
    align-items: center;
    box-sizing: border-box;
    min-height: calc(var(--spacing, 4px) * 10);
    padding-block: 4px;
  }
  .codexhost-model-picker-slider {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    box-sizing: border-box;
    height: 32px;
    margin-inline: 2px;
    padding: 2px 6px;
    outline: none;
  }
  .codexhost-model-picker-slider-root {
    --codexhost-model-picker-motion-duration: 0.3s;
    --codexhost-model-picker-motion-easing: cubic-bezier(0.23, 1, 0.32, 1);
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    height: 28px;
    touch-action: none;
    cursor: var(--cursor-interaction, pointer);
  }
  .codexhost-model-picker-slider-root[data-disabled="true"] {
    opacity: 0.6;
    cursor: default;
  }
  .codexhost-model-picker-slider-root[data-dragging="true"] {
    --codexhost-model-picker-motion-duration: 0.15s;
    cursor: grabbing;
  }
  .codexhost-model-picker-slider-track {
    position: relative;
    flex-grow: 1;
    height: 24px;
    overflow: hidden;
    border-radius: 12px;
    background: color-mix(in srgb, var(--color-text, #1a1c1f) 10%, transparent);
    box-shadow: inset 0 0 0 0.5px var(--color-border, rgba(0, 0, 0, 0.08));
  }
  .codexhost-model-picker-slider-range {
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    width: 100%;
    overflow: hidden;
    border-radius: 12px 0 0 12px;
    background-color: var(--color-chart-blue, #3a83f7);
    will-change: transform;
  }
  .codexhost-model-picker-slider-max-fill {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
    background-image:
      linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0) 65%),
      linear-gradient(90deg, #7f58f4 0%, #9763f1 20%, #b993ff 38%, #c775e9 52%, #9763f1 70%, #6f45dc 86%, #7f58f4 100%);
    background-size: 100% 100%, 260px 100%;
    background-repeat: no-repeat, repeat-x;
    transition: opacity 0.3s cubic-bezier(0.23, 1, 0.32, 1);
    animation: codexhost-model-picker-max-flow 4.2s linear infinite;
  }
  .codexhost-model-picker-slider-root[data-maximum="true"] .codexhost-model-picker-slider-max-fill {
    opacity: 1;
  }
  .codexhost-model-picker-popover[data-reduced-motion="true"] .codexhost-model-picker-slider-max-fill {
    animation: none;
  }
  @keyframes codexhost-model-picker-max-flow {
    from {
      background-position: 0 0, 0 0;
    }
    to {
      background-position: 0 0, -260px 0;
    }
  }
  .codexhost-model-picker-tick-rail {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .codexhost-model-picker-tick {
    position: absolute;
    top: 50%;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background-color: currentColor;
    transform: translate(-50%, -50%);
    transition:
      background-color var(--codexhost-model-picker-motion-duration) var(--codexhost-model-picker-motion-easing),
      color var(--codexhost-model-picker-motion-duration) var(--codexhost-model-picker-motion-easing),
      opacity 0.2s ease-in-out,
      filter 0.12s ease,
      transform 0.12s ease;
  }
  .codexhost-model-picker-tick[data-selected="true"] {
    color: #ffffff4d;
  }
  .codexhost-model-picker-tick[data-selected="false"] {
    color: color-mix(in srgb, var(--color-codex-description, #8f8f8f) 50%, transparent);
  }
  .codexhost-model-picker-slider-root[data-maximum="true"] .codexhost-model-picker-tick {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.75);
    transition-duration: 0.4s, 0.4s, 0.4s, 0.12s, 0.4s;
    transition-delay: 0s, 0s, 0.1s, 0s, 0s;
  }
  .codexhost-model-picker-slider-root[data-hover-index] .codexhost-model-picker-tick[data-hovered="true"] {
    filter: brightness(0.85);
    transform: translate(-50%, -50%) scale(2);
  }
  .codexhost-model-picker-thumb-rail {
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    z-index: 4;
    width: 100%;
    pointer-events: none;
  }
  .codexhost-model-picker-thumb-scale {
    position: absolute;
    top: 50%;
    width: 28px;
    height: 28px;
    transform: translate(-50%, -50%);
    will-change: left;
  }
  .codexhost-model-picker-thumb-spring {
    position: absolute;
    inset: 0;
    z-index: 3;
    transform-origin: 50%;
    transition: scale 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .codexhost-model-picker-slider-root[data-thumb-active="true"] .codexhost-model-picker-thumb-spring {
    scale: 1.142857;
    transition-duration: 0.22s;
  }
  .codexhost-model-picker-thumb {
    position: absolute;
    inset: 0;
    display: block;
    box-sizing: border-box;
    border: 0.5px solid var(--color-border-strong, rgba(0, 0, 0, 0.12));
    border-radius: 50%;
    background: #fff;
    color: var(--color-control-thumb-foreground, #1a1c1f);
    box-shadow: 0 0 2px #0000001a;
  }
  .codexhost-model-picker-slider[data-keyboard-focused="true"] .codexhost-model-picker-thumb {
    outline: 2px solid var(--color-ring, #3a83f7);
    outline-offset: 0;
  }
  .codexhost-model-picker-menu[data-transitions-ready="true"] .codexhost-model-picker-slider-root[data-animate="true"] .codexhost-model-picker-thumb-scale {
    transition: left var(--codexhost-model-picker-motion-duration) var(--codexhost-model-picker-motion-easing);
  }
  .codexhost-model-picker-menu[data-transitions-ready="true"] .codexhost-model-picker-slider-root[data-animate="true"] .codexhost-model-picker-slider-range {
    transition: transform var(--codexhost-model-picker-motion-duration) var(--codexhost-model-picker-motion-easing);
  }
  .codexhost-model-picker-menu[data-reduced-motion="true"] .codexhost-model-picker-thumb-scale,
  .codexhost-model-picker-menu[data-reduced-motion="true"] .codexhost-model-picker-slider-range,
  .codexhost-model-picker-menu[data-reduced-motion="true"] .codexhost-model-picker-thumb-spring,
  .codexhost-model-picker-menu[data-reduced-motion="true"] .codexhost-model-picker-tick {
    transition: none !important;
  }
  .codexhost-model-picker-model-list {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    max-height: min(316px, calc(var(--codexhost-model-picker-available-height, 60vh) - var(--spacing, 4px)));
    padding-inline: var(--spacing, 4px);
  }
  .codexhost-model-picker-rows {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    margin-block-end: calc(-1 * var(--spacing, 4px));
    padding-block-end: var(--spacing, 4px);
    scrollbar-width: auto;
    scrollbar-color: auto;
  }
  .codexhost-model-picker-rows::-webkit-scrollbar {
    width: calc(var(--spacing, 4px) * 2);
    height: calc(var(--spacing, 4px) * 2);
  }
  .codexhost-model-picker-rows::-webkit-scrollbar-track {
    background-color: transparent;
  }
  .codexhost-model-picker-rows::-webkit-scrollbar-button {
    display: none;
    width: 0;
    height: 0;
  }
  .codexhost-model-picker-rows::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: var(--radius-full, 9999px);
    background-color: transparent;
    background-clip: padding-box;
  }
  .codexhost-model-picker-rows:hover::-webkit-scrollbar-thumb,
  .codexhost-model-picker-rows:focus-within::-webkit-scrollbar-thumb {
    background-color: var(--color-token-scrollbar-slider-hover-background, rgba(127, 127, 127, 0.4));
  }
  .codexhost-model-picker-section-label {
    flex: none;
    padding-inline: var(--padding-row-x, 8px);
    padding-block: var(--spacing, 4px);
    font-size: var(--text-sm, 13px);
    line-height: var(--text-sm--line-height, 1.4286);
    color: var(--color-codex-description, var(--color-text-tertiary, #8f8f8f));
  }
  .codexhost-model-picker-search {
    display: flex;
    flex: none;
    align-items: center;
    gap: calc(var(--spacing, 4px) * 1.5);
    padding: var(--padding-row-y, 4px) var(--padding-row-x, 8px);
    color: var(--color-text-tertiary, #8f8f8f);
  }
  .codexhost-model-picker-search > svg {
    flex: none;
  }
  .codexhost-model-picker-search > input {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    appearance: none;
    background: transparent;
    color: var(--color-text, inherit);
    font: inherit;
    font-size: var(--text-sm, 13px);
    line-height: var(--text-sm--line-height, 1.4286);
    letter-spacing: 0;
    outline: none;
    user-select: text;
  }
  .codexhost-model-picker-search > input::placeholder {
    color: var(--color-text-tertiary, #8f8f8f);
  }
  .codexhost-model-picker-search > input::-webkit-search-cancel-button {
    appearance: none;
    display: none;
  }
  .codexhost-model-picker-separator {
    flex: none;
    padding-block: var(--spacing, 4px);
    padding-inline: var(--padding-row-x, 8px);
  }
  .codexhost-model-picker-separator::before {
    content: "";
    display: block;
    height: 1px;
    background: var(--color-border, rgba(0, 0, 0, 0.08));
  }
  .codexhost-model-picker-row {
    position: relative;
    display: flex;
    flex: none;
    align-items: center;
    border-radius: var(--radius-xl, 12px);
  }
  @media (hover: hover) {
    .codexhost-model-picker-row:hover {
      background-color: var(--color-background-primary-ghost-hover, rgba(127, 127, 127, 0.08));
    }
  }
  .codexhost-model-picker-row:focus-within {
    background-color: var(--color-background-primary-ghost-hover, rgba(127, 127, 127, 0.08));
  }
  .codexhost-model-picker-row[data-disabled="true"] {
    background-color: transparent;
  }
  .codexhost-model-picker-item {
    display: flex;
    flex: 1;
    align-items: center;
    gap: calc(var(--spacing, 4px) * 1.5);
    min-width: 0;
    padding: var(--padding-row-y, 4px) var(--padding-row-x, 8px);
    border-radius: inherit;
    color: var(--color-text, inherit);
    font-size: var(--text-sm, 13px);
    line-height: var(--text-sm--line-height, 1.4286);
    cursor: var(--cursor-interaction, pointer);
  }
  .codexhost-model-picker-item:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .codexhost-model-picker-item-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .codexhost-model-picker-item-check {
    flex: none;
    opacity: 0.75;
  }
  .codexhost-model-picker-row:hover .codexhost-model-picker-item-check,
  .codexhost-model-picker-row:focus-within .codexhost-model-picker-item-check {
    opacity: 1;
  }
  .codexhost-model-picker-favorite {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 24px;
    height: 24px;
    margin-inline-end: 4px;
    padding: 5px;
    border-radius: 999px;
    color: var(--color-text-tertiary, #8f8f8f);
    cursor: var(--cursor-interaction, pointer);
    opacity: 0;
  }
  .codexhost-model-picker-row:hover .codexhost-model-picker-favorite,
  .codexhost-model-picker-row:focus-within .codexhost-model-picker-favorite,
  .codexhost-model-picker-favorite[aria-pressed="true"] {
    opacity: 1;
  }
  .codexhost-model-picker-favorite:hover {
    color: var(--color-text-secondary, #6b6b6b);
    background: var(--color-background-primary-ghost-hover, rgba(127, 127, 127, 0.08));
  }
  .codexhost-model-picker-favorite[aria-pressed="true"] {
    color: #f59e0b;
  }
  .codexhost-model-picker-favorite:focus-visible {
    outline: 2px solid var(--color-ring, #3a83f7);
    outline-offset: -2px;
  }
  .codexhost-model-picker-favorite > svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .codexhost-model-picker-favorite[aria-pressed="true"] > svg {
    fill: currentColor;
  }
  .codexhost-model-picker-empty {
    padding: var(--padding-row-y, 4px) var(--padding-row-x, 8px);
    color: var(--color-text-tertiary, #8f8f8f);
    font-size: var(--text-sm, 13px);
    line-height: var(--text-sm--line-height, 1.4286);
  }
  .codexhost-model-picker-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
    pointer-events: none;
  }
  @supports (corner-shape: superellipse(1.5)) {
    .codexhost-model-picker-popover,
    .codexhost-model-picker-row,
    .codexhost-model-picker-view-toggle,
    .codexhost-model-picker-view-toggle-content,
    .codexhost-model-picker-icon-button,
    .codexhost-model-picker-icon-button-content {
      corner-shape: var(--codex-corner-shape, round);
    }
  }
  @media (forced-colors: active) {
    .codexhost-model-picker-view-toggle:focus-visible,
    .codexhost-model-picker-icon-button:focus-visible,
    .codexhost-model-picker-item:focus-visible,
    .codexhost-model-picker-slider:focus-visible {
      outline: 2px solid CanvasText;
      outline-offset: 2px;
    }
  }
`;
}

export function ensureRendererModelPickerStyle(ownerDocument: Document): void {
  const existing = ownerDocument.querySelector(`style[${STYLE_ATTRIBUTE}]`);
  if (existing?.getAttribute(STYLE_ATTRIBUTE) === STYLE_VERSION) return;
  const style = existing ?? ownerDocument.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, STYLE_VERSION);
  style.textContent = rendererModelPickerStyleText();
  if (!existing) (ownerDocument.head ?? ownerDocument.documentElement).append(style);
}
