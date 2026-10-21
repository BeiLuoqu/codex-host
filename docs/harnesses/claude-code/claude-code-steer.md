# Claude Code 同轮插入

Claude Code 的运行中插入走 Agent SDK 流式输入：向当前 Query 的输入流推入 `SDKUserMessage`，`priority: "next"`，`origin: { kind: "human" }`。这不会取消当前 Turn，也不会另开一轮。`now` 会把正在运行的 shell 命令、子 Agent 和 MCP 调用转入后台后立即送达，`later` 会等到空闲，Adapter 都不用。

Host 在原生接受后自己发当前 Turn 的 `userMessage` Item。Adapter 不发这条 Item，也不改历史解析。

## 接受

CLI 先发 `command_lifecycle` `queued`，表示 Claude 已接受这条输入；工具调用结束后发 `started`，这时插入进入正在运行的 Turn。Adapter 在 `queued` 时返回 `{ accepted: true }`：此后由 Claude 负责送达，不等 `started`，否则调用方要被整段工具调用挂住（Desktop 提交约 30 秒超时）。若本轮在插入前结束，Claude 会把已排队的输入作为下一次运行执行，由现有自主 Turn 路径呈现。输入一旦写入就无法撤回，所以本轮的 `result` 先于 `queued` 到达时不拒绝，仍按接受处理；`queued` 回执迟迟不到时，等待 5 秒后同样按接受处理，避免串行处理请求的调用方（如 Harness Broker）被无限期占住。只有目标不是当前 Turn、输入写入失败，或会话在接受前关闭或出错时，才返回 `invalidState`。空文本返回 `invalidRequest`。忙时 `turn.start` 仍是 `sessionBusy`。

## 版本

2026-09-24 在 Claude Code 2.1.280 上实机确认；2026-10-21 在 Claude Code 2.1.305（Agent SDK 0.3.273 与 0.3.305）上复核了相同的 `queued` → `started` → `completed` 顺序和单个 `result`。没有查到 `priority: "next"` 的更早引入版本，因此不设版本门槛，已安装的 Claude Code 都声明 `capabilities.steer`。

## 历史

原生把插入记成同一条 transcript 里的 `queued_command` attachment（`commandMode: "prompt"`，`source_uuid` 是插入消息 id），不是新的 user 消息。现有历史解析忽略 attachment，所以刷新后仍是原来那一轮，插入文本不会变成单独的 Turn 或 Item。

## 验证

实机：模型 `haiku`，权限 `bypassPermissions`，一轮里调用 Bash 执行 `sleep 4; echo tool-done`，工具开始后以 `priority: "next"` 插入一句。流里只有一次 `result`（`subtype: "success"`，`terminal_reason: "completed"`）。`started` 出现在工具结果之后、下一次模型请求之前，模型回复提到了插入的句子。因此实时结果处理不改：纯文本 user 回显本来就被忽略，第一个 `result` 仍是本轮结束。

2026-10-21 复核：Linux aarch64，Claude Code 2.1.305，Adapter 自身的 `ClaudeSdkTransport` 驱动真实 CLI。一轮要求依次执行三次 `sleep 6`，第一个工具开始约 1.5 秒后调用 `steer()`。`steer()` 在 `queued` 时立即 resolve；本轮只执行了一次 `sleep`，`runTurn` 以 `succeeded` 结束，transcript 中模型回复的是插入要求的文本。
