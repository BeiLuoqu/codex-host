# 外部 Harness 的模型与思考强度选择器

外部 Harness 的模型选择器与 Codex 原生选择器表达同一件事，因此外观和操作保持一致：一个弹层，两个视图。实现位于 `packages/renderer-extension/src/renderer-model-picker*.ts`。

## 触发按钮

- 显示为 Codex 的 `模型  强度  ˅` 样式；Fast 开启时，模型名前显示实心闪电。
- 无障碍名称为 `Model: 模型名, 强度`；选择失败时附带错误原因。
- 窄屏输入框（`renderer-trigger-chip-style` 的紧凑模式）隐藏强度文字；强度标签带 `data-codexhost-model-thinking` 标记。
- 状态为 `loading`、`waitingForAdapter`、`selecting` 或目录为空时，按钮禁用。

## 弹层与视图

弹层从触发按钮上方展开：底边贴齐按钮，水平居中于按钮，超出视口时向内收紧，宽 254px，高度不超过按钮上方的可用空间（至少 120px）。

```
点击触发按钮 ─▶ 打开弹层
                 ├─ 有 2 个及以上思考强度，或模型支持 Fast ─▶ 滑块视图
                 └─ 其他情况 ─────────────────────────────▶ 列表视图

滑块视图 ── 点击模型名 ──▶ 列表视图
列表视图 ── 选中其他模型 ─▶ 回到滑块视图，保持打开等待 Host 应用；
                            新模型没有思考强度可调、也不支持 Fast 时关闭
列表视图 ── 选中当前模型 ─▶ 滑块视图可用时回到滑块视图，否则关闭并聚焦触发按钮
Esc、点击弹层外部、滑块上按 Enter ─▶ 关闭
```

### 滑块视图

- 顶部一行：中间是当前模型名和强度（点击进入列表视图），左侧是 Fast 开关，右侧是“恢复默认”。
- 模型只有一档或没有思考强度、但支持 Fast 时，仍显示这一行（不显示滑块），保证 Fast 可以操作。
- 滑块支持拖动、点击刻度、`←`/`→`、`Home`/`End` 和滚轮。键盘调整只更新预览，停顿约 320 ms 后提交一次；拖动松手时提交。焦点移到弹层内其他控件（例如 Fast）时不立即提交，该控件的操作会先提交待定的强度；焦点离开弹层或关闭弹层时立即提交。待定的强度只属于发起时的 Model：期间载入了其他 Model 则放弃提交。
- 选择应用期间控件暂时禁用，焦点因此离开弹层时，应用完成后回到原控件。
- 最高档（例如 `xhigh` 及以上）使用紫色。

### 列表视图

- 模型超过 8 个时显示搜索框，按名称、id 和解析后的运行时名称匹配。
- 收藏保存在 `localStorage`，每个 Harness 单独保存；收藏的模型排在前面。未收藏的星标只在悬停或聚焦时显示，切换收藏不会选中模型。

### Fast

- 只在所选模型提供 `fastModel` 时显示，位于弹层顶部一行的左侧。开启时实际选择该模型的 Fast 变体，思考强度不变。
- 无障碍名称说明当前状态（“Fast 已开启 · 点击关闭”）；悬停提示同时说明“Fast 模式：优先处理请求，可能增加额度消耗。”。
- 切换到不支持 Fast 的模型时隐藏；切回原模型时按该模型自己的设置显示，不沿用之前的选择。

### 恢复默认

当前模型或思考强度与 Harness 默认值不同时，在顶部一行右侧显示，同时恢复默认模型和默认强度。

## 思考强度排序

Harness 只保证提供 id 和 label，不保证顺序：

1. 先按 id、再按 label 查等级表（小写，空格和下划线视为 `-`）：`off/none/disabled` < `minimal/lowest` < `low/light` < `medium` < `high` < `xhigh/very-high` < `max/highest` < `ultra/ultracode`。
2. 全部可识别且整体从高到低时，翻转为从低到高；含无法识别的项时保持 Harness 给出的顺序。
3. 最高档判定：末位且等级不低于 `xhigh`；全部无法识别时，至少 4 档才把末位视为最高档。

## 缩放与动态效果

- Codex 用 CSS `zoom: var(--codex-window-zoom)` 缩放窗口。定位时把按钮位置和视口尺寸除以缩放比例，与 Agent、权限模式选择器一致；弹层最大宽度同样按缩放换算后写入（CSS 的 `100vw` 不受该缩放影响），窄窗口放大时不越界。
- 系统开启“减少动态效果”，或 Codex 设置 `data-reduced-motion="true"` 时，关闭过渡动画。

## 状态与边界

| 情况 | 行为 |
| --- | --- |
| 正在应用选择（`selecting`） | 触发按钮禁用，弹层保持打开，避免闪烁 |
| 加载中（`loading` 等）且弹层打开 | 保留内容但禁用模型项、滑块、Fast 和恢复默认，并丢弃过期的 Fast 目标 |
| 选择被 Host 拒绝 | 弹层关闭，触发按钮旁显示错误提示（同一错误只提示一次） |
| 切换 Harness | 关闭弹层，重新读取该 Harness 的收藏，丢弃未提交的预览和待确认选择 |
| 选择器隐藏或销毁 | 关闭弹层；销毁时移除弹层和事件监听 |

## 无障碍

- 弹层为 `role="menu"`；列表项为 `menuitemradio`，Fast 为 `menuitemcheckbox`，均带 `aria-checked`。
- 滑块为 `role="slider"`，带 `aria-valuemin`、`aria-valuemax`、`aria-valuenow`、`aria-valuetext`，强度变化通过 `role="status"` 播报。
- 弹层内 `Tab` 在当前视图的可聚焦元素间循环；列表中 `↑`/`↓` 移动；`Esc` 关闭并把焦点还给触发按钮。

## 模块

| 模块 | 职责 |
| --- | --- |
| `renderer-model-picker.ts` | 弹层、两个视图、开合生命周期、待确认选择和渲染入口 |
| `renderer-model-picker-positioning.ts` | 弹层和选择失败提示的定位（纯函数） |
| `renderer-model-picker-style.ts` | 样式表，只使用 Codex 主题变量 |
| `renderer-model-picker-icons.ts` | 图标（lucide）与收藏星标 |
| `renderer-model-picker-intelligence.ts` | 思考强度排序、最高档判定、滑块几何和中英文文案 |

验证：`packages/renderer-extension/test/renderer-model-picker.test.ts`，以及 Playwright 用例 `renderer-model-picker`、`renderer-model-fast`、`renderer-model-favorites`、`renderer-binding-startup`。
