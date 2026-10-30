import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";

const browserExecutable = process.env.CODEXHOST_PLAYWRIGHT_EXECUTABLE_PATH;
if (browserExecutable) test.use({ launchOptions: { executablePath: browserExecutable } });
const { outputFiles } = await build({
  stdin: {
    contents: `
    import { mountRendererModelPicker, renderRendererModelPicker } from "./packages/renderer-extension/src/renderer-model-picker.ts";
    const catalog = { models: [
      { ref: { id: "normal" }, fastModel: { id: "priority" }, label: "c / supported", supportedThinkingOptionIds: ["high"] },
      { ref: { id: "unsupported" }, label: "c / unsupported", supportedThinkingOptionIds: ["high"] }
    ], thinkingOptions: [{ id: "high", label: "High" }] };
    let view = { status: "ready", catalog, selected: { id: "normal" }, selectedThinkingOptionId: "high" };
    let visible = true;
    let locale = "zh-CN";
    const render = () => renderRendererModelPicker(control, view, visible, "pi", locale);
    const control = mountRendererModelPicker("fast-test", (id) => {
      view = { ...view, selected: { id } };
      render();
    }, () => {});
    document.body.append(control.root);
    render();
    const actions = document.createElement("div");
    actions.style.cssText = "position:fixed;top:12px;left:12px;display:flex;gap:8px";
    for (const [label, action] of [
      ["Hide picker", () => { visible = false; render(); }],
      ["Disable picker", () => { view = { ...view, status: "selecting" }; render(); }],
      ["Dispose picker", () => control.dispose()],
      ["English", () => { locale = "en"; render(); }],
    ]) {
      const button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", action);
      actions.append(button);
    }
    document.body.append(actions);
  `,
    resolveDir: path.resolve(import.meta.dirname, "../.."),
    loader: "ts",
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  write: false,
});
const bundle = outputFiles[0]?.text;

async function mountFastFixture(page: Page, theme = "dark") {
  if (!bundle) throw new Error("Fast picker bundle was not generated");
  await page.route("http://fast.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><style>
    html { color-scheme:${theme} }
    body { font:13px system-ui; margin:0; height:100vh; display:flex; align-items:flex-end; justify-content:center; background:light-dark(#fafafa,#242424); color:light-dark(#222,#fff) }
    [data-codexhost-model-control] { margin-bottom:40px; padding:8px; background:light-dark(white,#343434); border-radius:18px }
    [popover] { background:white; box-shadow:0 2px 15px #ddd }
  </style></head><body></body></html>`,
    }),
  );
  await page.goto("http://fast.test/");
  await page.addScriptTag({ content: bundle });
}

test("Fast is per selected model, inside the picker and independent from Thinking", async ({
  page,
}) => {
  await mountFastFixture(page);
  const root = page.locator('[data-codexhost-model-control="fast-test"]');
  const trigger = root.locator('button[aria-haspopup="menu"]');
  const triggerBolt = trigger.locator(".codexhost-model-picker-trigger-icon");
  const popover = page.locator("[data-codexhost-model-picker]");
  // Fast lives in the popover's top row, like the native Codex picker.
  const fast = popover.getByRole("menuitemcheckbox");
  const models = popover.locator("button[data-model-id]");
  const openModelList = () => popover.locator(".codexhost-model-picker-view-toggle").click();

  await expect(trigger).toContainText("c / supportedHigh");
  await expect(triggerBolt).toBeHidden();
  await trigger.click();
  await expect(popover).toBeVisible();
  await expect(fast).toBeVisible();
  await expect(fast).toHaveAttribute("aria-checked", "false");
  await expect(fast).toHaveAttribute("aria-label", "Fast 已关闭 · 点击开启");
  // The usage warning stays with the toggle.
  await expect(fast).toHaveAttribute("title", /Fast 模式：优先处理请求，可能增加额度消耗。/u);

  await fast.click();
  await expect(fast).toHaveAttribute("aria-checked", "true");
  await expect(fast).toHaveAttribute("aria-label", "Fast 已开启 · 点击关闭");
  await expect(triggerBolt).toBeVisible();
  // Fast swaps the Model for its priority variant; Thinking is unchanged.
  await expect(trigger).toContainText("High");
  await fast.click();
  await expect(fast).toHaveAttribute("aria-checked", "false");
  await expect(triggerBolt).toBeHidden();

  await fast.click();
  await openModelList();
  await expect(models).toHaveCount(2);
  await models.filter({ hasText: "c / unsupported" }).click();
  await expect(trigger).toContainText("c / unsupportedHigh");
  await expect(fast).toBeHidden();
  await expect(triggerBolt).toBeHidden();

  // Nothing is left to adjust, so the picker closes; it reopens straight on the Model list.
  await expect(popover).toBeHidden();
  await trigger.click();
  await expect(popover).toBeVisible();
  await expect(popover.locator(".codexhost-model-picker-menu")).toHaveAttribute(
    "data-view",
    "advanced",
  );
  await models.filter({ hasText: "c / supported" }).first().click();
  // Returning to the Model starts from its own setting, not the earlier Fast choice.
  await expect(fast).toBeVisible();
  await expect(fast).toHaveAttribute("aria-checked", "false");
  await fast.focus();
  await page.keyboard.press("Space");
  await expect(fast).toHaveAttribute("aria-checked", "true");
});

test("Fast help follows the settings locale", async ({ page }) => {
  await mountFastFixture(page);
  const trigger = page.locator(
    '[data-codexhost-model-control="fast-test"] button[aria-haspopup="menu"]',
  );
  const fast = page.locator("[data-codexhost-model-picker]").getByRole("menuitemcheckbox");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await trigger.click();
  await expect(fast).toHaveAttribute("aria-label", "Fast is off · Click to enable");
  await expect(fast).toHaveAttribute("title", /may increase usage/u);
  await fast.click();
  await expect(fast).toHaveAttribute("aria-label", "Fast is on · Click to disable");
});

for (const action of ["Hide picker", "Disable picker", "Dispose picker"]) {
  test(`Fast follows the picker on ${action}`, async ({ page }) => {
    await mountFastFixture(page);
    const trigger = page.locator(
      '[data-codexhost-model-control="fast-test"] button[aria-haspopup="menu"]',
    );
    const popover = page.locator("[data-codexhost-model-picker]");
    const fast = popover.getByRole("menuitemcheckbox", { includeHidden: true });
    await trigger.click();
    await expect(fast).toBeVisible();
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(popover).toBeHidden();
    if (action === "Dispose picker") {
      await expect(popover).toHaveCount(0);
      await expect(trigger).toHaveCount(0);
    } else if (action === "Disable picker") {
      await expect(fast).toBeDisabled();
      await expect(trigger).toBeDisabled();
    } else {
      await expect(trigger).toBeHidden();
    }
  });
}
