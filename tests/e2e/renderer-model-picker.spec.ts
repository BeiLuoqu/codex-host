import { expect, test, type Page } from "@playwright/test";
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

      globalThis.setupInteractiveRendererModelPicker = () => {
        const thinking = ["low", "high", "xhigh"];
        const catalog = {
          models: [
            { ref: { id: "a" }, fastModel: { id: "a-fast" }, label: "Provider / A", supportedThinkingOptionIds: thinking },
            { ref: { id: "b" }, label: "Provider / B", supportedThinkingOptionIds: thinking },
          ],
          defaultModel: { id: "a" },
          thinkingOptions: [
            { id: "low", label: "Low" },
            { id: "high", label: "High" },
            { id: "xhigh", label: "Extra High" },
          ],
          defaultThinkingOptionId: "low",
        };
        const calls = [];
        globalThis.pickerCalls = calls;
        let view = { status: "ready", catalog, selected: { id: "a" }, selectedThinkingOptionId: "low" };
        let control;
        const render = () => renderRendererModelPicker(control, view, true, "pi");
        // Host applies each selection after a short "selecting" phase.
        const apply = (change) => {
          view = { ...view, status: "selecting" };
          render();
          setTimeout(() => {
            view = { ...view, ...change, status: "ready" };
            render();
          }, 120);
        };
        control = mountRendererModelPicker(
          "interactive-composer",
          (modelId) => {
            calls.push("model:" + modelId);
            apply({ selected: { id: modelId } });
          },
          (thinkingId) => {
            calls.push("thinking:" + thinkingId);
            apply({ selectedThinkingOptionId: thinkingId });
          },
        );
        document.body.append(control.root);
        render();
        // Another draft or Thread loading a different Model of the same Harness.
        globalThis.loadPickerView = (status, modelId) => {
          view = { ...view, status, ...(modelId ? { selected: { id: modelId } } : {}) };
          render();
        };
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

const mountInteractivePicker = async (page: Page) => {
  await page.setContent(
    '<!doctype html><body style="display:flex;align-items:flex-end;justify-content:center;min-height:100vh;margin:0"></body>',
  );
  await page.addScriptTag({ content: browserBundle });
  await page.evaluate(() => {
    const setup = Reflect.get(globalThis, "setupInteractiveRendererModelPicker");
    if (typeof setup !== "function") throw new Error("Interactive picker setup is unavailable");
    setup();
  });
  const trigger = page.locator(
    '[data-codexhost-model-control="interactive-composer"] > button[aria-haspopup="menu"]',
  );
  const popover = page.locator("[data-codexhost-model-picker]");
  return {
    trigger,
    popover,
    slider: popover.getByRole("slider"),
    fast: popover.getByRole("menuitemcheckbox"),
    calls: () => page.evaluate(() => [...(Reflect.get(globalThis, "pickerCalls") as string[])]),
    focusInPicker: () =>
      page.evaluate(() => {
        const active = document.activeElement;
        return Boolean(active?.closest("[data-codexhost-model-picker]"));
      }),
  };
};

test("moving to Fast right after a keyboard Thinking change applies both", async ({ page }) => {
  const picker = await mountInteractivePicker(page);
  await picker.trigger.click();
  await picker.slider.focus();
  await page.keyboard.press("End");
  // Within the 320 ms keyboard commit delay, focus moves to Fast before it is activated:
  // committing on that blur would disable Fast and swallow the activation.
  await picker.fast.focus();
  await page.keyboard.press("Space");
  await expect.poll(picker.calls).toEqual(["thinking:xhigh", "model:a-fast"]);
  await expect(picker.fast).toHaveAttribute("aria-checked", "true");
  await expect(picker.popover).toBeVisible();
  // The selection disabled the focused Fast toggle; focus comes back once it is ready.
  await expect.poll(picker.focusInPicker).toBe(true);
});

test("Tab after a keyboard Thinking change keeps focus in the picker", async ({ page }) => {
  const picker = await mountInteractivePicker(page);
  await picker.trigger.click();
  await picker.slider.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Tab");
  await expect.poll(picker.calls).toEqual(["thinking:xhigh"]);
  await expect(picker.slider).toBeEnabled();
  await expect(picker.slider).toHaveAttribute("aria-valuetext", /Extra High/u);
  await expect.poll(picker.focusInPicker).toBe(true);
});

test("a pending keyboard Thinking change does not apply to a Model loaded meanwhile", async ({
  page,
}) => {
  const picker = await mountInteractivePicker(page);
  await picker.trigger.click();
  await picker.slider.focus();
  await page.keyboard.press("End");
  await page.evaluate(() => Reflect.get(globalThis, "loadPickerView")("loading"));
  await page.waitForTimeout(80);
  await page.evaluate(() => Reflect.get(globalThis, "loadPickerView")("ready", "b"));
  await page.waitForTimeout(500);
  expect(await picker.calls()).toEqual([]);
});

test("loading disables Fast and drops its stale target", async ({ page }) => {
  const picker = await mountInteractivePicker(page);
  await picker.trigger.click();
  await expect(picker.fast).toBeEnabled();
  await page.evaluate(() => Reflect.get(globalThis, "loadPickerView")("loading"));
  await expect(picker.trigger).toBeDisabled();
  await expect(picker.fast).toBeDisabled();
  await picker.fast.click({ force: true });
  expect(await picker.calls()).toEqual([]);
});

test("stays inside a narrow zoomed window", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
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
  const box = await popover.boundingBox();
  if (!box) throw new Error("Zoomed Model picker geometry is unavailable");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
});
