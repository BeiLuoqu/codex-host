# 外部 Thread 的本地图片显示

外部 Harness 的消息由 codexhost 投影成 Codex Desktop 原生条目后显示。本地图片能否显示，取决于投影出的条目是否满足 Desktop 的加载规则。本文记录当前做法和边界，依据 Codex Desktop 26.1021.3705.0 的渲染代码核对；Desktop 更新后需重新核实。

## Desktop 的加载规则

Agent 消息中的 Markdown 图片（`![alt](目标)`）只有在目标是绝对路径（`/…`、`C:\…`、`C:/…`、UNC）或 `file:` URL 时，才会被当作本地文件，经 app-server 读取后显示。其他目标按 Desktop 页面自身地址解析，加载失败后显示“Image unavailable”占位框。只有预览 `.md` 文件时，Desktop 才会按该文件所在目录补全相对路径；对话消息没有这个基准目录。

Harness 常按工作目录写相对路径，因此需要由 Adapter 改写。

## Agent 消息：改写本地媒体路径

`@codexhost/harness-adapter/local-media-markdown` 提供共用的改写：

- 改写图片目标中的本地媒体路径，以及只包含一个媒体路径的行内代码（转成图片）。相对路径按 Adapter 给出的根目录依次查找，只有找到实际存在的文件才改写。
- 远程 URL、`data:` 等地址、找不到的文件、无法解析的写法和围栏代码块中的内容保持原样，不改动一个字节。
- Windows 盘符路径写成正斜杠（`C:/…`）。CommonMark 会把反斜杠加标点当作转义，原样输出会让 `C:\Users\me\.codex\…` 丢掉分隔符。
- 支持的扩展名：图片 `png`、`jpg`、`jpeg`、`gif`、`webp`、`svg`，音视频 `mp4`、`m4v`、`mov`、`webm`、`mp3`、`m4a`、`aac`、`ogg`、`wav`。

实时输出只能追加，Host 要求条目完成时的全文等于此前所有增量之和。`LocalMediaMarkdownStream` 因此只暂缓结尾仍可能被后续文本改变的写法（未闭合的图片、未闭合的行内代码），写错的图片或单个反引号不会扣住后面的文字；Item 结束前再补发暂缓部分。同一条消息内，每个路径只检查一次文件，保证前后改写一致。

接入的 Harness：

| Harness | 根目录 | 范围 |
| --- | --- | --- |
| Grok | 工作目录、Grok 会话目录及其 `videos/`、`images/`、用户 `Downloads/` | 实时输出与历史 |
| DeepSeek Harness | Agent 当前工作目录（随 `working-directory/change` 更新），再到 Session 工作目录 | 实时输出与历史（`readSnapshot`）；用量刷新不做改写 |

其他 Harness 的 Agent 文本仍原样转发；它们输出相对路径时，图片仍显示为占位框。
