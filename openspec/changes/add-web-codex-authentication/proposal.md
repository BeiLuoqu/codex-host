# Proposal

## Why

Web Codex 应与其他 Harness 一样由原生 CLI 使用本地认证，Host 不维护额外认证准入或队列状态。GUI 原生路由与 Web 插件路由不同，不要求认证目录隔离。

## What Changes

- 删除 Codex 认证预检查、认证失效联动及认证专属队列暂停；原生失败正常报错，队列沿用通用执行规则。
- Web 默认使用环境中的 CODEX_HOME 或 ~/.codex，支持 --codex-home 覆盖；不复制凭据，不自动迁移已有会话。
- 移除 Adapter 和 Owner 对 GUI home 重叠的拒绝；保留原生 CLI 校验、路由环境清理、会话归属和 nativeRef 的 home 绑定。
- Codex 使用公共 Adapter / Session 契约和 Loader，保留既有追加指令与只读历史能力；GUI 官方 Codex 不进入插件，standalone 禁用。

- 未选工作区的 Codex 首次提交复用 Host 已有的 projectlessWorkspace 请求和目录分配逻辑，不新增用户配置或目录策略。

## Capabilities

### New Capabilities

- `web-codex-authentication`：直接使用本地原生认证，不提供认证管理或预检查。

### Modified Capabilities

- `harness-adapter-text-session`：以可选公共方法表达已有原生追加指令。
- `harness-adapter-history-fork-session`：以可选公共方法表达已有只读历史。

## Impact

Codex 插件、会话运行时认证分支、Web home 默认值、Host home 校验及其测试和文档。不修改 GUI 原生转发或重写会话引擎；不新增依赖或登录能力。
