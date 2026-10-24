import {
  harnessModelCatalogSchema,
  harnessModelRefSchema,
  harnessThinkingOptionIdSchema,
} from "@codexhost/shared-contracts";
import { describe, expect, it } from "vitest";

import {
  rendererModelPickerPlacement,
  rendererModelSelectionNoticePlacement,
} from "../src/renderer-model-picker-positioning.js";

import {
  isMaximumThinkingOption,
  modelPickerMessages,
  modelPickerSliderLeft,
  modelPickerSliderRangeTransform,
  orderedThinkingOptions,
  thinkingOptionRank,
} from "../src/renderer-model-picker-intelligence.js";

import {
  isRendererModelPickerDisabled,
  rendererModelPickerPresentation,
  rendererModelSelectionFailed,
  rendererModelSelectionNoticeContent,
  shouldCloseRendererModelPicker,
  shouldOpenRendererModelSelectionNotice,
  syncRendererLabelText,
  type RendererModelControlView,
} from "../src/renderer-model-picker.js";

const model = harnessModelRefSchema.parse({ id: "pi-model-v1.synthetic" });

function catalog(levels: readonly string[]) {
  const thinkingOptions = levels.map((id) => ({
    id: harnessThinkingOptionIdSchema.parse(id),
    label: id === "xhigh" ? "Extra High" : `${id[0]?.toUpperCase() ?? ""}${id.slice(1)}`,
  }));
  return harnessModelCatalogSchema.parse({
    models: [
      {
        ref: model,
        label: "provider / model",
        supportedThinkingOptionIds: thinkingOptions.map(({ id }) => id),
      },
    ],
    defaultModel: model,
    thinkingOptions,
    ...(thinkingOptions[0] ? { defaultThinkingOptionId: thinkingOptions[0].id } : {}),
  });
}

describe("Renderer combined Model and Thinking picker presentation", () => {
  it("uses the same label and Thinking options for a Fast selection", () => {
    const fast = harnessModelRefSchema.parse({ id: "priority" });
    const normal = catalog(["off", "high"]);
    const withFast = harnessModelCatalogSchema.parse({
      ...normal,
      models: normal.models.map((entry) => ({ ...entry, fastModel: fast })),
    });
    expect(
      rendererModelPickerPresentation({
        status: "ready",
        catalog: withFast,
        selected: fast,
        selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("high"),
      }),
    ).toMatchObject({ modelLabel: "provider / model", thinkingLabel: "High" });
  });
  it("centers the picker on the Model trigger and caps it to the space above", () => {
    expect(
      rendererModelPickerPlacement(
        { left: 700, right: 900, top: 820, width: 200 },
        { width: 1200, height: 900 },
        0,
      ),
    ).toEqual({ left: 673, bottom: 86, availableHeight: 806, originX: 127 });
  });

  it("keeps the picker inside the viewport next to a screen edge", () => {
    const placement = rendererModelPickerPlacement(
      { left: 0, right: 50, top: 820, width: 50 },
      { width: 240, height: 900 },
      0,
    );
    expect(placement.left).toBe(8);
    // The opening animation still starts at the trigger, even when clamped.
    expect(placement.originX).toBe(17);
    expect(
      rendererModelPickerPlacement(
        { left: 1150, right: 1199, top: 820, width: 49 },
        { width: 1200, height: 900 },
        0,
      ).left,
    ).toBe(938);
  });

  it("measures the trigger in unzoomed pixels for a zoomed Codex window", () => {
    expect(
      rendererModelPickerPlacement(
        { left: 1050, right: 1350, top: 1230, width: 300 },
        { width: 1200, height: 1350 },
        0,
        1.5,
      ),
    ).toEqual({ left: 538, bottom: 86, availableHeight: 806, originX: 254 });
  });

  it("widens to the measured popover and clamps it to a narrow viewport", () => {
    expect(
      rendererModelPickerPlacement(
        { left: 700, right: 900, top: 820, width: 200 },
        { width: 1200, height: 900 },
        300,
      ).left,
    ).toBe(650);
    expect(
      rendererModelPickerPlacement(
        { left: 100, right: 150, top: 400, width: 50 },
        { width: 200, height: 900 },
        400,
      ),
    ).toMatchObject({ left: 8, availableHeight: 386 });
  });

  it("does not rewrite an unchanged Thinking label", () => {
    let value: string | null = "High";
    let writes = 0;
    const element = {
      get textContent() {
        return value;
      },
      set textContent(next: string | null) {
        writes += 1;
        value = next;
      },
    };

    expect(syncRendererLabelText(element, "High")).toBe(false);
    expect(writes).toBe(0);
    expect(syncRendererLabelText(element, "Extra High")).toBe(true);
    expect(syncRendererLabelText(element, "Extra High")).toBe(false);
    expect(writes).toBe(1);
  });

  it("shows only Adapter-reported Thinking options and the confirmed label", () => {
    const view = rendererModelPickerPresentation({
      status: "ready",
      catalog: catalog(["off", "low", "high"]),
      selected: model,
      selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("high"),
    });

    expect(view).toEqual({
      modelLabel: "provider / model",
      thinkingLabel: "High",
      thinkingOptions: [
        { id: "off", label: "Off" },
        { id: "low", label: "Low" },
        { id: "high", label: "High" },
      ],
      showThinkingSection: true,
      thinkingSelectionEnabled: true,
    });
    expect(view.thinkingOptions.map(({ id }) => id)).not.toContain("xhigh");
    expect(view.thinkingOptions.map(({ id }) => id)).not.toContain("max");
  });

  it("shows a runtime-resolved Model label after the selected Model", () => {
    const claudeModel = harnessModelRefSchema.parse({ id: "claude-model-v1.c29ubmV0" });
    const claudeCatalog = harnessModelCatalogSchema.parse({
      models: [
        {
          ref: claudeModel,
          label: "Family alias",
          resolvedModelLabel: "runtime-custom",
          supportedThinkingOptionIds: ["low", "high"],
        },
      ],
      defaultModel: claudeModel,
      thinkingOptions: [
        { id: "low", label: "Low" },
        { id: "high", label: "High" },
      ],
    });

    expect(
      rendererModelPickerPresentation({
        status: "ready",
        catalog: claudeCatalog,
        selected: claudeModel,
        thinkingSelectionSupported: false,
      }),
    ).toEqual({
      modelLabel: "Family alias",
      resolvedModelLabel: "runtime-custom",
      thinkingOptions: [],
      showThinkingSection: false,
      thinkingSelectionEnabled: false,
    });
  });

  it("shows Claude Thinking options through the shared picker when selection is enabled", () => {
    const claudeModel = harnessModelRefSchema.parse({ id: "claude-model-v1.c29ubmV0" });
    const claudeCatalog = harnessModelCatalogSchema.parse({
      models: [
        {
          ref: claudeModel,
          label: "Family alias",
          supportedThinkingOptionIds: ["off", "auto", "high"],
        },
      ],
      defaultModel: claudeModel,
      thinkingOptions: [
        { id: "off", label: "Off" },
        { id: "auto", label: "Auto" },
        { id: "high", label: "High" },
      ],
      defaultThinkingOptionId: "auto",
    });

    expect(
      rendererModelPickerPresentation({
        status: "ready",
        catalog: claudeCatalog,
        selected: claudeModel,
        selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("auto"),
        thinkingSelectionSupported: true,
      }),
    ).toMatchObject({
      thinkingLabel: "Auto",
      thinkingOptions: [
        { id: "off", label: "Off" },
        { id: "auto", label: "Auto" },
        { id: "high", label: "High" },
      ],
      showThinkingSection: true,
      thinkingSelectionEnabled: true,
    });
  });

  it("does not reuse global Thinking options for a Model without a declared list", () => {
    const uninspectedCatalog = harnessModelCatalogSchema.parse({
      models: [{ ref: model, label: "provider / model" }],
      defaultModel: model,
      thinkingOptions: [
        { id: "off", label: "Off" },
        { id: "high", label: "High" },
      ],
      defaultThinkingOptionId: "high",
    });

    expect(
      rendererModelPickerPresentation({
        status: "ready",
        catalog: uninspectedCatalog,
        selected: model,
        selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("high"),
      }),
    ).toEqual({
      modelLabel: "provider / model",
      thinkingOptions: [],
      showThinkingSection: false,
      thinkingSelectionEnabled: false,
    });
  });

  it("omits the Thinking section and trigger suffix when Pi reports only off", () => {
    expect(
      rendererModelPickerPresentation({
        status: "ready",
        catalog: catalog(["off"]),
        selected: model,
        selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("off"),
      }),
    ).toEqual({
      modelLabel: "provider / model",
      thinkingOptions: [{ id: "off", label: "Off" }],
      showThinkingSection: false,
      thinkingSelectionEnabled: false,
    });
  });

  it("shows one non-off Thinking option as read-only", () => {
    expect(
      rendererModelPickerPresentation({
        status: "ready",
        catalog: catalog(["minimal"]),
        selected: model,
        selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("minimal"),
      }),
    ).toMatchObject({
      thinkingLabel: "Minimal",
      showThinkingSection: true,
      thinkingSelectionEnabled: false,
    });
  });

  it("disables the combined control for loading and selection, but permits retry", () => {
    const readyCatalog = catalog(["off", "low"]);
    expect(isRendererModelPickerDisabled({ status: "loading" })).toBe(true);
    const selectingView = {
      status: "selecting" as const,
      catalog: readyCatalog,
      selected: model,
    };
    expect(isRendererModelPickerDisabled(selectingView)).toBe(true);
    expect(shouldCloseRendererModelPicker(selectingView)).toBe(false);
    expect(shouldCloseRendererModelPicker({ status: "loading" })).toBe(true);
    expect(
      isRendererModelPickerDisabled({
        status: "error",
        catalog: readyCatalog,
        selected: model,
        error: "selection failed",
      }),
    ).toBe(false);
    expect(isRendererModelPickerDisabled({ status: "error", error: "inspection failed" })).toBe(
      true,
    );
  });

  it("uses stable loading and unsupported presentation without inventing options", () => {
    for (const status of ["waitingForAdapter", "loading"] as const) {
      expect(isRendererModelPickerDisabled({ status })).toBe(true);
      expect(rendererModelPickerPresentation({ status })).toEqual({
        modelLabel: "Loading models...",
        thinkingOptions: [],
        showThinkingSection: false,
        thinkingSelectionEnabled: false,
      });
    }
    expect(
      rendererModelPickerPresentation({
        status: "ready",
        catalog: catalog([]),
        selected: model,
      }),
    ).toEqual({
      modelLabel: "provider / model",
      thinkingOptions: [],
      showThinkingSection: false,
      thinkingSelectionEnabled: false,
    });
  });
});

describe("Renderer Model selection rejection notice", () => {
  const ultracodeRejection =
    "Claude Code reports Ultracode is unavailable for the selected Model; choose another Model or Thinking option";
  const rejectedCatalog = catalog(["high", "ultracode"]);
  const rejected: RendererModelControlView = {
    status: "error",
    catalog: rejectedCatalog,
    selected: model,
    selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("high"),
    error: ultracodeRejection,
    selectionRejected: "model",
    selectionErrorId: 3,
  };

  it("marks only rejected user selections, not catalog or inspection failures", () => {
    expect(rendererModelSelectionFailed(rejected)).toBe(true);
    expect(rendererModelSelectionFailed({ ...rejected, selectionRejected: "thinking" })).toBe(true);
    const catalogFailure: RendererModelControlView = {
      status: "error",
      catalog: rejectedCatalog,
      selected: model,
      error: "Existing Thread Model is absent from the current Catalog",
    };
    expect(rendererModelSelectionFailed(catalogFailure)).toBe(false);
    expect(rendererModelSelectionFailed({ status: "error", error: "inspection failed" })).toBe(
      false,
    );
    // A later selection or reload replaces the view, which clears the trigger mark.
    expect(rendererModelSelectionFailed({ ...rejected, status: "selecting" })).toBe(false);
    expect(rendererModelSelectionFailed({ ...rejected, status: "ready" })).toBe(false);
    expect(rendererModelSelectionFailed({ ...rejected, error: "" })).toBe(false);
  });

  it("opens the notice once per rejection id, so re-renders never replay it", () => {
    expect(shouldOpenRendererModelSelectionNotice(rejected, 0)).toBe(true);
    expect(shouldOpenRendererModelSelectionNotice(rejected, 2)).toBe(true);
    expect(shouldOpenRendererModelSelectionNotice(rejected, 3)).toBe(false);
    // A remounted Composer starts from the newest presented id and skips older ones.
    expect(shouldOpenRendererModelSelectionNotice(rejected, 5)).toBe(false);
    // Repeating the same rejected choice gets a new id and shows the notice again.
    expect(shouldOpenRendererModelSelectionNotice({ ...rejected, selectionErrorId: 4 }, 3)).toBe(
      true,
    );
    const withoutId: RendererModelControlView = { ...rejected };
    delete withoutId.selectionErrorId;
    expect(shouldOpenRendererModelSelectionNotice(withoutId, 0)).toBe(false);
    expect(
      shouldOpenRendererModelSelectionNotice(
        {
          status: "error",
          catalog: rejectedCatalog,
          error: "External configuration control is unavailable",
          selectionErrorId: 9,
        },
        0,
      ),
    ).toBe(false);
  });

  it("titles the notice by the rejected choice and keeps the Host message", () => {
    expect(rendererModelSelectionNoticeContent(rejected)).toEqual({
      heading: "Couldn't switch Model",
      message: ultracodeRejection,
    });
    expect(rendererModelSelectionNoticeContent(rejected, "zh-CN")).toEqual({
      heading: "无法切换模型",
      message: ultracodeRejection,
    });
    expect(
      rendererModelSelectionNoticeContent({ ...rejected, selectionRejected: "thinking" }, "en"),
    ).toEqual({ heading: "Couldn't switch Thinking option", message: ultracodeRejection });
    expect(
      rendererModelSelectionNoticeContent({ ...rejected, selectionRejected: "thinking" }, "zh-CN")
        .heading,
    ).toBe("无法切换思考选项");
  });

  it("places the notice just above the Model trigger with right edges aligned", () => {
    expect(
      rendererModelSelectionNoticePlacement(
        { left: 700, right: 900, top: 820 },
        { width: 1200, height: 900 },
      ),
    ).toEqual({ right: 300, bottom: 88, maxWidth: 320, maxHeight: 804 });
  });

  it("keeps the notice inside a narrow viewport whatever its text width", () => {
    const placement = rendererModelSelectionNoticePlacement(
      { left: 0, right: 50, top: 820 },
      { width: 240, height: 900 },
    );
    expect(placement).toEqual({ right: 8, bottom: 88, maxWidth: 224, maxHeight: 804 });
    // Widest possible notice still starts at the left collision padding.
    expect(240 - placement.right - placement.maxWidth).toBe(8);
    expect(
      rendererModelSelectionNoticePlacement(
        { left: 1150, right: 1199, top: 820 },
        { width: 1200, height: 900 },
      ).right,
    ).toBe(8);
  });
});

describe("Renderer Model picker Thinking order and slider geometry", () => {
  const option = (id: string, label = id) => ({
    id: harnessThinkingOptionIdSchema.parse(id),
    label,
  });

  it("ranks a Thinking option by its id or its label, from off to Ultracode", () => {
    expect(thinkingOptionRank(option("off"))).toBe(0);
    expect(thinkingOptionRank(option("xhigh"))).toBe(5);
    expect(thinkingOptionRank(option("custom", "Ultracode"))).toBe(7);
    expect(thinkingOptionRank(option("unknown-option"))).toBeUndefined();
    expect(thinkingOptionRank(undefined)).toBeUndefined();
  });

  it("orders Thinking options low to high whatever the Harness reports", () => {
    const ascending = [option("off"), option("low"), option("high")];
    expect(orderedThinkingOptions(ascending)).toEqual(ascending);
    const descending = [option("ultracode"), option("high"), option("off")];
    expect(orderedThinkingOptions(descending).map(({ id }) => id)).toEqual([
      "off",
      "high",
      "ultracode",
    ]);
    // Unranked Harnesses keep the order they reported.
    const unranked = [option("alpha"), option("beta")];
    expect(orderedThinkingOptions(unranked)).toEqual(unranked);
  });

  it("marks only the highest Thinking option as maximum", () => {
    const ranked = [option("off"), option("high"), option("xhigh")];
    expect(isMaximumThinkingOption(ranked, 2)).toBe(true);
    expect(isMaximumThinkingOption(ranked, 1)).toBe(false);
    expect(isMaximumThinkingOption(ranked, 0)).toBe(false);
    expect(isMaximumThinkingOption([option("off"), option("medium")], 1)).toBe(false);
    // Unranked options fall back to the catalog length.
    const unranked = [option("a"), option("b"), option("c"), option("d")];
    expect(isMaximumThinkingOption(unranked, 3)).toBe(true);
    expect(isMaximumThinkingOption(unranked, 2)).toBe(false);
  });

  it("keeps the slider thumb and its filled range inside the track", () => {
    expect(modelPickerSliderLeft(0)).toBe("calc(0% + 13px)");
    expect(modelPickerSliderLeft(50)).toBe("calc(50% + 0px)");
    expect(modelPickerSliderLeft(100)).toBe("calc(100% + -13px)");
    expect(modelPickerSliderRangeTransform(0, 4)).toBe("translateX(calc(-100% + 0px))");
    expect(modelPickerSliderRangeTransform(50, 4)).toBe("translateX(calc(-50% + 0px))");
    expect(modelPickerSliderRangeTransform(100, 4)).toBe("translateX(calc(0% + 0px))");
    expect(modelPickerSliderRangeTransform(50, 0)).toBe("translateX(-100%)");
  });

  it("localizes the trigger, list and slider strings", () => {
    expect(modelPickerMessages("en").selectModel).toBe("Select model");
    expect(modelPickerMessages("zh-CN").selectModel).toBe("选择模型");
    expect(modelPickerMessages("zh-CN").thinkingValue("高", 2, 3)).toBe("高，第 2 项，共 3 项。");
    expect(rendererModelPickerPresentation({ status: "error" }, "zh-CN").modelLabel).toBe(
      "无法加载模型",
    );
  });
});
