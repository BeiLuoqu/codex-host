# Pi Codex Fast

## 交互

Pi 当前 Model 支持 Fast 时，Model 选择器弹层顶部一行左侧显示 Fast 开关（`menuitemcheckbox`，带 `aria-checked`），与 Codex 原生选择器一致；该 Model 没有可调的 Thinking 时也保留这一行，只是不显示滑块。灰色描边闪电表示关闭，实心闪电表示开启，开启时触发按钮的 Model 名称前同样显示实心闪电。无障碍名称标明“Fast 已关闭 · 点击开启”或“Fast 已开启 · 点击关闭”，悬停提示另说明“Fast 模式：优先处理请求，可能增加额度消耗。”；弹层位于页面顶层，不受工具栏裁剪，因此不再需要单独的浮层。支持鼠标与键盘操作；选择应用期间开关暂时禁用，完成后焦点回到原控件。切换 Fast 不打开 Model 列表，不改变 Thinking。交互细节见 [Model 选择器](../../product/model-picker.md)。

新 Thread 默认关闭，包括恢复上一次新 Thread 的 Model/Thinking 偏好时。同一草稿按 Desktop 的草稿 ID 保留当前显式选择，Composer 重挂载不重新套用默认关闭，预建与发送使用该选择。Fork 的新 Pi 进程也默认关闭；Host 根据派生 Session 的实际 Model 引用更新持久化选择，重新打开时不意外继承来源 Thread 的 Fast。选择其他 Model 会关闭 Fast；切回支持的 Model 仍默认关闭。已存在 Thread 的显式选择通过现有 Model Ref 保存，恢复时只在原生当前 Model 相符且能力仍可确认时重新开启；能力不可用时恢复普通模式，不阻塞历史读取。

## 能力来源

Pi Adapter 在现有 `inspect()` 获取 Model 目录的同一临时 RPC 进程中检查以下三个条件，全部满足时显示开关：

- Pi 原生 Model 的 `api` 为 `openai-codex-responses` 或 `openai-responses`。
- Model ID 包含 `gpt`，忽略大小写，不检查展示名称。
- 当前 Pi 提供完整 Provider 查询/注册接口，已加载的 Host Fast 扩展支持上述两种协议，并公布可确认的设置命令。

判定不读取本地 OAuth 凭据或 Codex 模型缓存，也不发起能力探测请求。开关表示客户端请求 `priority`，不保证上游接受或实际采用 Fast；上游可能忽略或拒绝该参数。

能力随既有按 cwd 的 Model 目录缓存；显式刷新和凭据导入、重导入、移除沿用现有失效路径，不增加后台轮询。已有会话的 cwd 尚未缓存时，选择 Fast 使用当前 Pi 进程查询模型与扩展能力，再做同样的判定，不另起 inspection 进程，也不借用其他 cwd 的能力结论。

## 请求与状态

小型扩展随 Pi Adapter Bundle 交付。启动原生 Pi 时，将内容寻址资源写到 `${CODEXHOST_DATA_DIR:-~/.codexhost}/extensions/pi-codex-fast/<digest>.mjs` 并通过 `--extension` 加载，不改 Pi 全局设置，也无需用户单独安装。默认关闭时不注册替代 Provider 或改变请求。

开启时扩展包装当前 Provider 已有的 `stream` / `streamSimple`，保留其认证、模型和其他原生方法，仅对启用的目标 Model 加入原生 `serviceTier: "priority"`，并通过 `onPayload` 确保最终请求体含 `service_tier: "priority"`：Pi 的 `streamSimple` 会丢弃前者，但保留 payload 钩子。包装会等待并保留原有钩子的修改、替换结果和错误，再确保 priority 字段；关闭时原样传递调用选项，不添加该参数。各 Pi 进程独立持有开关；切换 Model 前关闭，切换 Thinking 保持开关。设置通过扩展命令执行，并等待带随机 nonce 的原生通知确认，不能把普通 Prompt 回执当作成功，也不重启 Pi 模拟 Fast。命令发送后发生错误或缺少确认时，将会话标记为故障并关闭原生进程，禁止继续发送；不能假定报错意味着请求策略未改变。运行中选择先完成 Thinking 能力查询，再切换 Fast 并立即公布已确认状态，避免后续查询失败留下未公布的 priority。

公共 Model Catalog 的可选 `fastModel` 是普通 Model 的独立、不含凭据的配置引用；Renderer、委派校验及 Model/Thinking 展示使用同一目录解析函数。Pi 的编码、Model 筛选和请求语义全部属于 Pi Adapter，不进入 Host 或 Renderer。

## 验证边界

定向测试覆盖两种 Responses API、Model ID 大小写及别名、展示名称不参与判定、无凭据和模型缓存、扩展不可用、并发资源发布、两种协议最终请求体的 priority 注入（包括 `streamSimple` 丢弃选项的路径）、已有 payload 钩子的同步修改/异步替换/错误传播、参数与 Thinking 保持、原生命令确认、确认失败后的进程关闭与发送阻断、选择及恢复、Fork 的持久化与重新打开一致性，以及浏览器中按钮显隐、开关、Model 菜单和键盘操作。

本机 Pi 的隔离离线冒烟检查确认扩展可加载，并能在显式加载的别名 Provider 上确认开关；使用合成凭据，没有发起 Model Turn。浏览器验证包含真实控件及 binding/prewarm 路由的隔离测试页面，覆盖同一草稿重挂载后预建与发送的 Fast 引用一致性，但不等同于完整 Codex Desktop 验收。本机 `c / gpt-6-astra` 的隔离真实请求检查确认：同一 Pi 会话按关→开→关发送时，请求的 `service_tier` 为缺省→`priority`→缺省，三个请求均成功完成。但服务端原始完成事件均返回 `default`，因此这只证明客户端请求策略正确，不能确认服务端实际采用 priority 调度，也未验证速度或额度变化。不保证任意用户扩展在之后重新注册 Provider 时仍保持该包装。
