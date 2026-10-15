# GUI/Web 会话所有权架构概览

本文描述当前实现的所有权边界；协议和产品行为见[客户端通道](host-client-channel.md)与[独立 Web](../product/standalone-web.md)。

## 执行流程

GUI 和 Web 网关先发现并检查已运行的共享 Host，有则连接，无则通过原生 Launcher 启动。Web 可在没有 Desktop 的情况下使用 Host；关闭任一前端不停止后台或正在执行的任务。发现使用动态端口与认证描述文件，检查不是原子互斥，不保证并发启动严格单实例。

Rust 负责后台进程监管与正常退出时的子进程清理。Shared Host 不使用单实例锁、隔离来源 profile/home 所有权锁、恢复抢锁或退出证明，也不提供监管者被强杀后的安全交接保证。Mapping Store 保留自身的存储锁。

## 模块和数据边界

- `@codexhost/session-runtime` 提供由共享 Host 使用的隔离 Sessions 运行/恢复与持久化实现；Web 网关不创建本地执行 owner。
- Host 通过安装插件公共契约注入固定单 home 配置；不导入 web-server 应用代码或具体 Adapter。Web RPC/stream、认证、Push 与 UI 投影留在网关。
- external AppServerHost/MappingStore 保留既有边界。隔离来源的 metadata、index、events/projections、checkpoint/backfill/children 与 Web 自建 workspace/local pin/archive 位于 Host 的 `web-codex` 目录。
- 保留独立 canonical home、插件 scope 与 nativeRef locator guard。跨进程地址由服务端给出并校验，客户端不能据 scope 自选 home/nativeRef；未知或跨来源请求明确拒绝。
- GUI 原生 Codex 保留官方执行与历史，不变成 external 或隔离可执行地址。官方项目只读，external 官方 pin 仍走 Desktop。

## 使用边界

Host 保存一个隔离 Web Codex 配置，连接中的前端不能更换它的 home、CLI 或插件路径。不为不同 Host 共用同一 home 提供互斥；应使用同一个 Host 连接同一来源。

不提供旧 standalone 数据迁移、回滚或交接入口，不检查或清理旧锁及迁移标记，不自动移动用户数据。已有共享来源继续读取自身的会话文件和配置。未知提交不重发，不恢复不存在的内存队列；Host 失联时 Web 不回退到本地执行。Push 依赖 Web 网关存活。
