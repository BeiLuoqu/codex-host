## 1. 抽取现有隔离会话实现

- [ ] 1.1 追踪Sessions实际调用与类型，将runtime/恢复/metadata/journal移入session-runtime公共exports；分离Web RPC/stream/EventHub/Push耦合。
- [ ] 1.2 standalone使用该实现，保持既有格式和能力；添加定向行为回归，核对journal与checkpoint恢复。

## 2. 后台所有权与访问边界

- [ ] 2.1 shared Host显式装配一个隔离Web Codex配置，复用插件scope/home guard；完善存储与composition排他准入、配置冲突拒绝及native退出证明。
- [ ] 2.2 在现有client channel增加最小来源地址/能力门槛和窄操作；所有入口校验scope/身份，拒绝native GUI或跨来源操作。
- [ ] 2.3 Web shared来源改用Host client及既有epoch/snapshot订阅；断线不fallback、不重发未知写命令，停止gateway不关闭owner。
- [ ] 2.4 覆盖Web-only/Desktop-only、两启动顺序、并发连接、第二writer、GUI native边界、idle未确认与后台崩溃恢复。

## 3. 单源迁移与Web自有组织数据

- [ ] 3.1 添加新版源owner锁/实例登记与静默检查；明确legacy人工确认/正常退出入口，活跃或未决源延后且不丢队列。
- [ ] 3.2 实现严格源格式/journal/引用检查、staging与原子commit记录；迁完整恢复集合及明确Web自建workspace/隔离local pin/archive，分类排除并报告mixed文件external/自动reference数据，保留home与原附件路径。
- [ ] 3.3 遇坏数据/源变化/ID或目标冲突阻止迁移并保留源；实现commit恢复与无新mutation回滚限制，不增alias/自动dedup。
- [ ] 3.4 测试活跃源延后、坏行/未知schema/冲突拒绝、阶段故障、commit后新写回滚拒绝、旧writer/协议拒绝及组织数据恢复；确认不改官方项目/收藏权威。

## 4. 收口与验收

- [ ] 4.1 删除shared模式本地执行和durable写路径，standalone仅保留同实现独立composition；完善发行兼容门槛与显式交接。
- [ ] 4.2 更新客户端通道/独立Web当前行为文档，明确GUI原生隔离、官方pin离线限制、Push与未知结果边界；不宣称尚未验证能力。
- [ ] 4.3 按package.json执行受影响构建/定向测试及boundary checker；完成计划的native生命周期实测，记录实际结果与未验证项。
