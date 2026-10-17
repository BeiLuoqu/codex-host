# Design

## Context

共享 Host 同时承载 GUI 原生路径和 Web Codex 插件。执行入口与会话归属决定路由；原生 home 决定 CLI 配置、凭据和历史位置，两者不是同一个边界。

## Decisions

- Adapter 的 inspect 只查询原生模型目录，不调用 account/read，也不在打开会话前检查认证。CLI 自己读取本地凭据、环境配置并处理刷新。
- 原生错误转换为普通 Harness 失败并保留错误消息，不识别认证类型以驱动额外状态。删除认证 generation、失效回调、事件及队列暂停；不同请求、会话和目录检查互不触发认证状态联动。
- 模型检查保留与 Pi 类似的按 cwd 在途合并和进程关闭逻辑；无认证缓存或就绪承诺，目录可读不等于推理可用。
- Web home 优先级是 --codex-home、环境 CODEX_HOME、~/.codex；插件工厂接受显式 home，也可沿用本地默认。GUI 与 Web 可以共用 home；不复制凭据文件，不创建替代认证目录。
- 保留原生 CLI 路径校验与 Desktop 路由环境清理。共享 home 不会自动导入或恢复 GUI Thread；普通创建仍创建新 Native Session，已有原生会话只通过显式导入进入插件。不得把共享 home 当作同一 Native Session 多写者协调机制。
- 保留已有 home 绑定、固定来源配置、Host 会话存储和 GUI/Web 路由边界，不修改任何用户数据。已有 Host 配置不会被新默认值静默替换，继续使用旧来源时显式传入其 --codex-home。

- Web 首次发送 Codex 草稿时，有 cwd 则沿用，没有则传递已有 projectlessWorkspace 字段及首条输入。Owner 复用 clientProjectlessWorkspaceSchema 和 allocateProjectlessWorkspace；同一已准备会话沿用原目录。
- 会话元数据用可选 workspaceKind=projectless 标记执行目录，避免 LocalSessionOrganization 把它自动登记为项目。现有显式工作区会话不变；未选工作区草稿在首次发送前不创建目录或原生会话。

## Public changes retained

- 公共 Adapter / Session 类型与可选 steer / readHistory：表达已有原生能力，避免镜像结构和私有命令。
- 公共 Loader 显式启用及范围检查：复用统一加载生命周期，GUI external 范围仍在导入前排除 Codex。
- Web 将 inspect 委派给插件，并将选定的本地 home 传给 Host；Owner 取消 home 重叠禁令，仍拒绝配置漂移与跨会话请求。
- 会话运行时不再存在认证专属状态或队列分支。

## Risks / Trade-offs

- 模型目录查询成功不保证认证、额度或模型权限可用，最终以原生执行结果为准。
- 共用 home 也会共用原生配置与历史；路由隔离并不是存储隔离。显式导入现有 Native Session 不提供跨进程写入互斥。
- 原生凭据刷新和活动进程是否热加载配置由 CLI 决定，Host 不重启或重放任务。

## Migration

不迁移凭据、会话、journal 或配置格式。已有固定来源及其 home 绑定保持；旧部署若使用 <web-data>/codex-home，应继续显式传 --codex-home 指向该目录，不自动切换已有会话。standalone 保持禁用。
