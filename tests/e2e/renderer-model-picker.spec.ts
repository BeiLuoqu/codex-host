import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const browserExecutable = process.env.CODEXHOST_PLAYWRIGHT_EXECUTABLE_PATH;
if (browserExecutable) test.use({ launchOptions: { executablePath: browserExecutable } });

const { outputFiles } = await build({
  stdin: {
    contents: `
      import {
        mountRendererModelPicker,
        renderRendererModelPicker,
      } from "./packages/renderer-extension/src/renderer-model-picker.ts";

      globalThis.setupRendererModelPicker = () => {
        const modelA = { id: "model-a" };
        const modelB = { id: "model-b" };
        const catalog = {
          models: [
            {
              ref: modelA,
              label: "Provider / Model A",
              supportedThinkingOptionIds: ["off", "low"],
            },
            {
              ref: modelB,
              label: "Provider / Model B",
              supportedThinkingOptionIds: ["off", "high", "xhigh"],
            },
          ],
          defaultModel: modelA,
          thinkingOptions: [
            { id: "off", label: "Off" },
            { id: "low", label: "Low" },
            { id: "high", label: "High" },
            { id: "xhigh", label: "Extra High" },
          ],
          defaultThinkingOptionId: "low",
        };
        let view = {
          status: "ready",
          catalog,
          selected: modelA,
          selectedThinkingOptionId: "low",
        };
        let control;
        control = mountRendererModelPicker(
          "test-composer",
          (modelId) => {
            view = { ...view, status: "selecting" };
            renderRendererModelPicker(control, view, true);
            setTimeout(() => {
              view = {
                status: "ready",
                catalog,
                selected: modelId === modelB.id ? modelB : modelA,
                selectedThinkingOptionId: modelId === modelB.id ? "high" : "low",
              };
              renderRendererModelPicker(control, view, true);
            }, 250);
          },
          () => {},
        );
        document.body.append(control.root);
        renderRendererModelPicker(control, view, true);
      };

      globalThis.setupClaudeRendererModelPicker = () => {
        const alias = { id: "claude-model-v1.alias" };
        const concrete = { id: "claude-model-v1.concrete" };
        const catalog = {
          models: [
            {
              ref: alias,
              label: "Family alias",
              resolvedModelLabel: "Runtime custom",
              supportedThinkingOptionIds: ["low", "high"],
            },
            {
              ref: concrete,
              label: "Runtime custom",
              resolvedModelLabel: "Runtime custom",
            },
          ],
          defaultModel: alias,
          thinkingOptions: [
            { id: "low", label: "Low" },
            { id: "high", label: "High" },
          ],
        };
        const view = {
          status: "ready",
          catalog,
          selected: alias,
          resolvedModelLabel: "Runtime custom",
          thinkingSelectionSupported: false,
        };
        const control = mountRendererModelPicker(
          "claude-composer",
          () => {},
          () => {},
        );
        document.body.append(control.root);
        renderRendererModelPicker(control, view, true);
      };
    `,
    resolveDir: repositoryRoot,
    sourcefile: "renderer-model-picker-e2e-entry.ts",
    loader: "ts",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2024",
  write: false,
});

const browserBundle = outputFiles[0]?.text;
if (!browserBundle) throw new Error("Renderer Model picker E2E bundle was not generated");

test("selecting a Model keeps the picker open and refreshes the Thinking slider", async ({
  page,
}) => {
  await page.setContent(
    '<!doctype html><body style="display:flex;align-items:flex-end;min-height:100vh;margin:0"></body>',
  );
  await page.addScriptTag({ content: browserBundle });
  await page.evaluate(() => {
    const setup = Reflect.get(globalThis, "setupRendererModelPicker");
    if (typeof setup !== "function") throw new Error("Model picker setup is unavailable");
    setup();
  });

  const root = page.locator('[data-codexhost-model-control="test-composer"]');
  const trigger = root.locator(':scope > button[aria-haspopup="menu"]');
  // The picker opens in the top layer, outside its control root.
  const popover = page.locator("[data-codexhost-model-picker]");
  const menu = popover.locator(".codexhost-model-picker-menu");
  const modelRows = popover.locator("button[data-model-id]");

  await trigger.click();
  await expect(popover).toBeVisible();
  await expect(menu).toHaveAttribute("data-view", "simple");
  await expect(popover.locator('[role="slider"]')).toBeVisible();
  const [triggerBox, popoverBox] = await Promise.all([
    trigger.boundingBox(),
    popover.boundingBox(),
  ]);
  if (!triggerBox || !popoverBox) throw new Error("Model picker geometry is unavailable");
  expect(popoverBox.y + popoverBox.height).toBeLessThanOrEqual(triggerBox.y + 1);

  await popover.locator(".codexhost-model-picker-view-toggle").click();
  await expect(menu).toHaveAttribute("data-view", "advanced");
  await expect(modelRows).toHaveCount(2);
  await modelRows.filter({ hasText: "Provider / Model B" }).click();

  // The picker stays open while Host applies the selection, then returns to the slider.
  await expect(popover).toBeVisible();
  await expect(trigger).toBeDisabled();
  await expect(menu).toHaveAttribute("data-view", "simple");
  await expect(trigger).toBeEnabled();
  await expect(popover).toBeVisible();
  await expect
    .poll(() =>
      popover
        .locator("[data-thinking-option-id]")
        .evaluateAll((ticks) => ticks.map((tick) => tick.getAttribute("data-thinking-option-id"))),
    )
    .toEqual(["off", "high", "xhigh"]);
  await expect(popover.locator(".codexhost-model-picker-effort-label")).toHaveText("High");
});

test("Claude aliases show actual runtime Model without exposing Thinking", async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <style>
      .native-model-trigger {
        display: flex;
        width: 100%;
        gap: 4px;
        padding: 4px 8px;
      }
    </style>
    <body style="display:flex;align-items:flex-end;min-height:100vh;margin:0"></body>
  `);
  await page.addScriptTag({ content: browserBundle });
  await page.evaluate(() => {
    const setup = Reflect.get(globalThis, "setupClaudeRendererModelPicker");
    if (typeof setup !== "function") throw new Error("Claude Model picker setup is unavailable");
    setup();
  });

  const root = page.locator('[data-codexhost-model-control="claude-composer"]');
  const trigger = root.locator(':scope > button[aria-haspopup="menu"]');
  await expect(trigger).toContainText("Family alias");
  await expect(trigger).toContainText("Runtime custom");
  await expect(trigger).toHaveAttribute("aria-label", /Family alias, Runtime custom/u);

  await trigger.click();
  const popover = page.locator("[data-codexhost-model-picker]");
  const menu = popover.locator(".codexhost-model-picker-menu");
  // No Thinking options: the picker opens straight into the Model list.
  await expect(menu).toHaveAttribute("data-view", "advanced");
  await expect(popover.locator(".codexhost-model-picker-track").first()).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(popover.locator("button[data-model-id]")).toHaveCount(2);

  const viewport = await page.evaluate(() => ({
    height: window.innerHeight,
    width: window.innerWidth,
  }));
  const popoverBox = await popover.boundingBox();
  const triggerBox = await trigger.boundingBox();
  if (!popoverBox || !triggerBox) throw new Error("Claude Model picker geometry is unavailable");
  expect(popoverBox.y + popoverBox.height).toBeLessThanOrEqual(triggerBox.y + 1);
  expect(popoverBox.x).toBeGreaterThanOrEqual(8);
  expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(viewport.width - 8);
  expect(popoverBox.y).toBeGreaterThanOrEqual(8);
  await expect(popover).not.toContainText("claude-model-v1");
});

test("stays centered above its trigger in a zoomed Codex window", async ({ page }) => {
  // Codex zooms its window with CSS `zoom: var(--codex-window-zoom)` on the document.
  await page.setContent(`
    <!doctype html>
    <html style="--codex-window-zoom: 1.5; zoom: var(--codex-window-zoom)">
      <body style="display:flex;align-items:flex-end;justify-content:center;min-height:100vh;margin:0"></body>
    </html>
  `);
  await page.addScriptTag({ content: browserBundle });
  await page.evaluate(() => {
    const setup = Reflect.get(globalThis, "setupRendererModelPicker");
    if (typeof setup !== "function") throw new Error("Model picker setup is unavailable");
    setup();
  });

  const trigger = page.locator(
    '[data-codexhost-model-control="test-composer"] > button[aria-haspopup="menu"]',
  );
  const popover = page.locator("[data-codexhost-model-picker]");
  await trigger.click();
  await expect(popover).toBeVisible();
  const [triggerBox, popoverBox] = await Promise.all([
    trigger.boundingBox(),
    popover.boundingBox(),
  ]);
  if (!triggerBox || !popoverBox) throw new Error("Zoomed Model picker geometry is unavailable");
  const triggerCenter = triggerBox.x + triggerBox.width / 2;
  const popoverCenter = popoverBox.x + popoverBox.width / 2;
  expect(Math.abs(popoverCenter - triggerCenter)).toBeLessThanOrEqual(2);
  expect(popoverBox.y + popoverBox.height).toBeLessThanOrEqual(triggerBox.y + 1);
  expect(popoverBox.y + popoverBox.height).toBeGreaterThanOrEqual(triggerBox.y - 24);
});
