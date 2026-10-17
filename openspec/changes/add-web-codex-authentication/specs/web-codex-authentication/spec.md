# Spec Delta

## Purpose

Web Codex 直接使用本地原生 CLI 的认证与配置；GUI 原生路由和 Web 插件路由独立，不强制原生 home 分离。

## ADDED Requirements

### Requirement: Authentication remains local and native

Web Codex MUST 使用原生 CLI 的本地配置和认证，MUST NOT 调用认证预检查、提供登录或账号管理接口、维护认证准入状态。模型目录检查 SHALL 只报告原生目录结果，不保证模型执行一定可用。

#### Scenario: Native model catalog is readable without valid authentication
- **WHEN** 原生 CLI 可以返回模型目录但推理认证不可用
- **THEN** 插件 SHALL 返回目录，不调用 account/read 或测试推理
- **AND** 用户请求执行时 SHALL 以原生结果确定成功或失败

#### Scenario: Native execution rejects credentials
- **WHEN** 原生执行返回认证错误
- **THEN** 插件 SHALL 正常报告失败及原生错误消息
- **AND** 系统 MUST NOT 触发认证状态联动、额外队列暂停、登录、失败消息重放或来源切换
- **AND** 后续排队消息 SHALL 沿用普通失败后的队列规则

#### Scenario: A client attempts Web login
- **WHEN** 客户端调用 Web Codex 的认证 read/start/cancel 方法
- **THEN** 系统 SHALL 按未知方法拒绝，不调用原生登录

### Requirement: Native home selection is independent of GUI routing

Web SHALL 优先使用 --codex-home，其次环境 CODEX_HOME，否则使用 ~/.codex。GUI 与 Web MAY 共用 home；系统 MUST NOT 因 home 与 GUI 相同或重叠而拒绝加载。原生 CLI SHALL 自行读取该目录的认证与配置，Host MUST NOT 复制凭据或自动迁移原生数据。

#### Scenario: Web reuses the existing local native home
- **WHEN** Web 未显式覆盖 home
- **THEN** 原生进程 SHALL 使用本地 CODEX_HOME 或默认 ~/.codex
- **AND** GUI 官方请求 SHALL 继续走原生路径，不进入该插件

#### Scenario: A user explicitly configures another home
- **WHEN** 用户通过 --codex-home 指定目录
- **THEN** 插件 SHALL 在该目录执行且不修改其他 home 的凭据
- **AND** 已有 Native Session 引用 SHALL 仍校验 home 绑定，不能隐式恢复到另一目录

#### Scenario: An existing Host has a different fixed source
- **WHEN** 请求配置的 home 与 Host 已有固定来源不同
- **THEN** Host SHALL 拒绝配置漂移，不切换已有会话的目录

### Requirement: Codex uses shared plugin contracts and loading

Web Codex SHALL 使用公共 Loader 和 Adapter / Session 契约；GUI external 范围 MUST 在导入前排除 Codex 插件。共享 Host 和原有会话归属规则 SHALL 保持，standalone MUST 保持禁用。

#### Scenario: Web and GUI run simultaneously
- **WHEN** Web 已在共享 Host 加载 Codex 插件且 GUI 同时连接
- **THEN** GUI 官方 Codex SHALL 保持原生路由，不创建或关闭 Web 的插件实例
- **AND** home 相同不构成将 GUI 会话请求路由给插件的授权

#### Scenario: Existing native operations use public contracts
- **WHEN** Web 调用已有追加指令或只读历史能力
- **THEN** SHALL 通过可选公共方法调用插件，保留原生语义

### Requirement: Projectless Codex submission uses existing Host allocation

未选工作区的 Web Codex 草稿 SHALL 在首次提交时使用既有 projectlessWorkspace 请求和 Host 分配逻辑。系统 MUST NOT 要求额外配置、继承最近项目或另设目录规则；生成的执行目录 MUST NOT 自动登记为用户项目。

#### Scenario: First submission without a selected workspace
- **WHEN** 用户未选工作区并向 Codex 发送第一条消息
- **THEN** Host SHALL 按既有日期、输入摘要及重名处理规则分配目录，并传给 Codex 执行
- **AND** 草稿发送前 MUST NOT 创建执行目录或原生会话

#### Scenario: An explicit workspace is selected
- **WHEN** 用户为 Codex 草稿选择了工作区
- **THEN** 系统 SHALL 使用该目录，不分配 projectless 目录

#### Scenario: A prepared projectless session is restored
- **WHEN** 已准备的会话再次被读取或 Host 重启后恢复
- **THEN** 系统 SHALL 保留原执行目录及未归属项目的状态，不因恢复再分配目录
