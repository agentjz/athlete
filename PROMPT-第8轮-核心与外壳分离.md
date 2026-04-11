# 第 8 轮强约束提示词：核心与外壳分离

你是 `GPT-5.4 Codex`，正在 `athlete` 仓库中执行“第 8 轮：核心与外壳分离”。

这是一个新项目。
如果旧宿主残余、错误接线方式、平行入口、历史耦合结构会拖累 host/core 分层，直接删、直接收口、直接重写。
不要为了旧错误接线保留长期兼容。

这一轮不是直接做一个完整 VS Code 产品，也不是顺手做一个花哨网页。
这一轮的唯一目标，是把 Athlete 从“CLI 直接绑住全部 runtime”进化成“一个核心执行系统 + 多宿主外壳”。

## 本轮唯一目标

完成 **核心 runtime 与宿主外壳的正式分层**，让未来的 CLI、网页、VS Code、微信、Telegram 都能共享同一个控制面和执行系统，而不是各自偷偷长一套逻辑。

## 本轮完成后必须成立

1. 明确区分“核心层”和“宿主层”。
2. CLI 变成一个宿主，而不是整个系统本体。
3. 核心层对外暴露清晰接口，供未来 VS Code / web / chat host 调用。
4. 宿主层不允许再发明平行真相源。
5. 旧错误宿主残余不会继续和新主干并存。
6. 文档、失败测试、实现、验证必须全部完成。

## 开工前必须先读

### 仓库内原则与规格

1. `spec/principles/README.md`
2. `spec/principles/P13-session是任务现场.md`
3. `spec/principles/P16-配置只能有一个入口.md`
4. `spec/principles/P17-扩展靠事件生长.md`
5. `spec/principles/P18-主循环和文件都不能长胖.md`
6. `spec/principles/P19-先写失败测试再写实现.md`
7. `spec/principles/P21-没验过就不能收口.md`
8. `spec/principles/P24-错误兼容不能高于正确性.md`
9. `spec/principles/P25-新项目不为旧残余保活.md`
10. `spec/repo/开发规则.md`
11. `spec/architecture/总体架构.md`
12. `spec/modules/扩展机制.md`
13. `REF/vscode-extension-redesign-research.md`

### 当前实现

1. `src/cli.ts`
2. `src/ui/`
3. `src/interaction/`
4. `src/telegram/`
5. `src/weixin/`
6. `src/agent/`
7. `src/orchestrator/`
8. `src/tasks/`
9. `src/team/`
10. `src/background/`
11. `src/worktrees/`

### 参考目录

1. `REF/pi-mono/README.md`
2. `REF/pi-mono/packages/`
3. `REF/dyad/README.md`
4. `REF/dyad/package.json`
5. `REF/Claude Code/main.tsx`
6. `REF/Claude Code/bridge/`
7. `REF/Claude Code/remote/`
8. `REF/weixin-agent-sdk/README.md`
9. `REF/weixin-agent-sdk/packages/`

## 宪法铁律

1. 先改文档，再写失败测试，再写实现。
2. 这一轮做的是“分层”，不是“加一个新壳再把旧耦合搬过去”。
3. 宿主层只能显示、输入、触发，不得发明控制面真相。
4. 配置入口仍然只能有一个。
5. 核心层不允许依赖某个具体宿主的 UI 细节。
6. 单文件超过 300 行必须检查并拆分。
7. 不能把 CLI 继续当成默认超级入口绑死全部初始化。
8. 旧宿主残余如阻碍分层，直接清理，不保留长期兼容。

## 固定执行顺序

1. 先读文档与参考。
2. 先更新架构文档，明确核心层与宿主层边界。
3. 先补失败测试。
4. 再重构目录和接口。
5. 再清理旧宿主残余。
6. 再验证 CLI、Telegram、Weixin 仍能工作。
7. 最后复核文档与实现一致性。

## 文档阶段必须完成的事

至少更新这些文档，必要时新增模块文档或 ADR：

1. `spec/architecture/总体架构.md`
2. `spec/modules/扩展机制.md`
3. 新增一个专门描述 host/core 边界的模块文档或 ADR
4. 如有必要，更新 `README.md` 中对产品结构的说明

文档里必须明确：

1. 哪些目录属于核心层。
2. 哪些目录属于宿主层。
3. 核心层对外暴露什么接口。
4. 宿主层禁止做什么。
5. CLI、Telegram、Weixin 在新结构里各自扮演什么角色。
6. 未来 VS Code / web 应该接在哪里，而不是再造什么。
7. 哪些旧宿主残余或错误接线方式不再保留。

## 失败测试必须先覆盖

至少覆盖这些场景：

1. CLI 通过核心层接口驱动 runtime，而不是直接耦合内部散装模块。
2. Telegram 与 Weixin 不需要自造平行状态即可复用核心能力。
3. 配置仍然通过统一入口解析。
4. 核心层接口变化不会破坏现有 one-shot / interactive / chat host 路径。
5. 宿主层无法绕过核心层直接发明控制面真相。
6. 重构后现有 session / task / background / team / worktree 真相仍保持统一。
7. 旧宿主残余路径不会继续和新 host/core 主干并存裁决。

## 实现阶段硬要求

1. 以最小必要重构实现 host/core 分层，不要为了抽象而抽象。
2. 明确抽出核心 runtime 入口与宿主适配层。
3. CLI 保留一流宿主地位，但不再承担全部系统耦合职责。
4. Telegram / Weixin 尽量复用统一宿主边界，而不是各写各的运行入口逻辑。
5. 不要新造第二套配置系统、第二套会话系统、第二套任务系统。
6. 为未来 VS Code / web 留清晰接线点，但本轮不要求把完整产品壳一起做完。
7. 如果旧宿主接线方式与新边界冲突，允许直接删除、收口或重写，不保留长期兼容。

## 本轮明确禁止

1. 禁止顺手做完整 VS Code 扩展或完整网页应用。
2. 禁止平台化过度，把仓库拆成一堆空壳包。
3. 禁止为了“抽象优雅”破坏现有可运行路径。
4. 禁止让宿主层继续偷偷保存自己的平行状态。
5. 禁止把核心接口设计成只服务某一个宿主。
6. 禁止为了旧错误接线长期保留双轨宿主结构。

## 验收标准

只有同时满足以下条件，才能算本轮完成：

1. 文档已经正式定义 host/core 边界与旧残余清理边界。
2. 失败测试先补过，并且能证明旧结构耦合过重。
3. 核心层与宿主层已经有真实目录和接口分层。
4. CLI、Telegram、Weixin 仍然可以工作。
5. `npm.cmd run check` 和 `npm.cmd test` 通过。
6. 未来再做 VS Code / web 时，不需要重新挖掉当前内核。
7. 旧错误宿主残余不再继续污染新主干。

## 最终汇报格式

最终汇报必须包含：

1. 哪些模块被认定为核心层。
2. 哪些模块被认定为宿主层。
3. 新的核心入口和宿主边界是什么。
4. 先补了哪些失败测试。
5. 哪些旧宿主残余或错误接线方式被删除、收口或重写。
6. CLI、Telegram、Weixin 如何验证仍然正常。
7. 未来 VS Code / web 会从哪里接入。
