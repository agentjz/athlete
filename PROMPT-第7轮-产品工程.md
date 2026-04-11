# 第 7 轮强约束提示词：产品工程（建立在第 6 轮已完成调度系统之上）

你是 `GPT-5.4 Codex`，正在 `athlete` 仓库中执行“第 7 轮：产品工程”。

## 第 6 轮已完成前提

以下内容视为已完成并且是当前主干事实：

1. SQLite 控制面账本已经是正式真相源，账本文件是 `.athlete/control-plane.sqlite`。
2. `lead / subagent / teammate / background` 已经有正式调度规则，且 `split / dispatch / wait / merge` 已经落地。
3. 复杂 objective 已能落成机器可恢复任务图，必要时会生成正式 `merge` 节点。
4. readiness、ownership、handoff legality、worktree legality 已由正式真相源推导。
5. reload / continue / reconcile 后，调度现场可以恢复。
6. 第 6 轮相关文档、失败测试、实现、验证已经完成并通过 `npm.cmd run check` 与 `npm.cmd test`。

本轮禁止回退到第 6 轮之前的状态。

如果你发现第 6 轮还有零星缺口，只允许做最小修补，不允许：

- 重新引入 JSON 真相源
- 重新引入双写
- 重新把协调逻辑塞回 prompt
- 把本轮重新做成“再来一轮调度工程”

## 这轮到底要做什么

这一轮不是加新业务能力大礼包。

这一轮要做的是：把当前系统从“骨架已经成立的工程仓库”继续打磨成“能让用户一上手就觉得像产品”的 CLI 工程。

重点不是新功能数量。
重点是：启动、配置、错误、恢复、运行透明度、轻命令体验。

## 本轮唯一目标

把 Athlete 的 **CLI 启动链、配置治理、错误呈现、运行透明度、产品级文本链路** 做硬，让系统在“用户操作感受”上明显升级。

## 本轮完成后必须成立

1. CLI 有明确 fast path，轻命令不会无脑走完整重路径。
2. 启动链按职责拆清楚，`src/cli.ts` 不再继续长胖。
3. 配置有明确 schema version 和处理策略；错误旧配置不要求长期兼容。
4. 关键错误对用户是可操作的，不是只吐技术异常。
5. runtime summary / doctor / one-shot closeout / 本地命令输出更稳定、更可读、更像产品。
6. Windows 环境下的编码、路径、命令入口体验被认真考虑。
7. 文档、失败测试、实现、验证必须全部完成。

## 当前已知主问题

以下问题视为本轮优先处理对象：

1. `src/cli.ts` 入口仍偏重，轻命令与重初始化路径耦合过多。
2. 顶层 import 过早拉起重模块，轻命令 fast path 不够硬。
3. 配置虽然能读写，但“版本、迁移、错误旧配置处理策略”不够明确。
4. `doctor`、CLI 报错、启动报错仍有技术味过重、用户可操作性不足的问题。
5. runtime summary / turn display / visible events / 本地命令输出还可以更产品化、更稳定。
6. 旧命令残影、旧输出碎片、旧配置偶然兼容的思路仍可能污染主路径。

## 开工前必须先读

### 仓库内原则与规格

1. `spec/principles/README.md`
2. `spec/principles/P16-配置只能有一个入口.md`
3. `spec/principles/P18-主循环和文件都不能长胖.md`
4. `spec/principles/P19-先写失败测试再写实现.md`
5. `spec/principles/P21-没验过就不能收口.md`
6. `spec/principles/P23-文本链路必须稳定可读.md`
7. `spec/principles/P24-错误兼容不能高于正确性.md`
8. `spec/principles/P25-新项目不为旧残余保活.md`
9. `spec/repo/开发规则.md`
10. `spec/testing/测试策略.md`
11. `README.md`

### 当前实现

1. `src/cli.ts`
2. `src/cli/support.ts`
3. `src/config/store.ts`
4. `src/config/init.ts`
5. `src/interaction/localCommands.ts`
6. `src/ui/runtimeSummary.ts`
7. `src/ui/runtimeSummaryData.ts`
8. `src/chat/visibleEvents.ts`
9. `src/agent/runtimeMetrics/`
10. `src/agent/runtimeTransition/`
11. `src/telegram/cli.ts`
12. `src/weixin/cli.ts`

### 当前相关测试

1. `tests/one-shot-cli-result-contract.test.ts`
2. `tests/interaction-shell.test.ts`
3. `tests/runtime-observability.test.ts`
4. `tests/text-chain-encoding.test.ts`
5. `tests/telegram-cli.test.ts`
6. `tests/weixin-cli.test.ts`
7. 其余和 CLI / runtime summary / visible events / turn display / config 相关测试

### 参考目录

1. `REF/Claude Code/main.tsx`
2. `REF/Claude Code/QueryEngine.ts`
3. `REF/txt/顶级开发团队设计的Harness工程项目源码什么样.txt`
4. `REF/dyad/README.md`
5. `REF/dyad/package.json`
6. `REF/pi-mono/README.md`
7. `REF/pi-mono/package.json`

## 宪法铁律

1. 先改文档，再写失败测试，再写实现。
2. 这一轮只做产品工程，不顺手扩业务大功能。
3. 配置、启动、错误、透明度都必须落到真实实现，不是只改 README。
4. 单文件超过 300 行必须检查并拆分。
5. 不能把更多杂务继续堆进 `src/cli.ts`。
6. 不能为了“看起来更友好”而吞掉关键错误。
7. 用户能看懂，比术语更重要。
8. 旧残余如阻碍当前更优产品结构，直接清理，不保留长期兼容。

## 固定执行顺序

1. 先阅读文档与参考。
2. 先更新 `spec/` 与 `README.md` 中对产品行为的定义。
3. 先补失败测试。
4. 再优化 CLI 启动链、配置处理、错误提示、运行透明度。
5. 再清理旧残余入口与输出。
6. 再跑完整验证。
7. 最后检查文档和行为是否一致。

## 文档阶段必须完成的事

至少更新这些文档，必要时新增模块文档或 ADR：

1. `README.md`
2. `spec/testing/测试策略.md`
3. `spec/modules/config-system.md` 或等价配置文档
4. 新增一个专门描述 CLI 启动链与产品工程约束的文档或 ADR

文档里必须明确：

1. 哪些 CLI 命令应该走 fast path。
2. 哪些命令必须走完整 runtime 初始化。
3. 配置文件是否有 schema version，版本不匹配时如何处理。
4. 旧错误配置如何处理，是一次性清理、一次性重建，还是低成本一次性升级。
5. runtime summary 应该告诉用户什么，哪些信号绝不能丢。
6. 出错时哪些信息必须直接告诉用户，哪些只适合调试信息。
7. 哪些旧命令残影、旧输出残余、旧兼容假象不再保留。

## 失败测试必须先覆盖

至少覆盖这些场景：

1. `--version` 或等价版本命令真实存在且可快速执行。
2. `--help` / 帮助输出与 CLI 行为稳定，不因重初始化污染。
3. 轻命令 fast path 不要求 API key，也不会意外拉起重 runtime。
4. 配置 schema version 变化时有明确处理路径，不会静默坏掉。
5. 关键错误会以用户可读方式呈现，并区分“用户可修复 / 环境问题 / 内部错误”。
6. runtime summary 能反映真实的 request / tool / recovery / wait / verification 状态。
7. 启动链重构后，现有 one-shot、resume、doctor、telegram、weixin 入口行为不被破坏。
8. 文本链路仍然稳定可读，不出现编码退化、输出碎裂、Windows 乱码。
9. 旧残余命令路径或输出碎片不会继续污染主路径。

## 实现阶段硬要求

1. 给 CLI 增加明确 fast path，不要让轻命令无脑走完整重路径。
2. 把启动链按职责拆清楚：
   - 入口分发
   - CLI 参数解析
   - 运行时配置解析
   - 重模块初始化
   - 命令执行
3. 如有必要，把 `src/cli.ts` 继续拆薄；不要再让它承担所有命令细节。
4. 配置增加明确版本与处理机制；不能靠“老文件碰巧还能读”，也不要为了错误旧配置背长期兼容层。
5. 错误提示要区分：
   - 用户可修复错误
   - 环境 / 网络 / provider 错误
   - 内部错误
6. `doctor`、runtime summary、one-shot closeout、local commands 输出必须更像产品，不像调试碎片。
7. 不要为了美观牺牲真实状态。
8. Windows 使用体验要考虑进来，尤其命令入口、编码、常见执行陷阱。
9. 如旧命令别名、旧输出残影、旧配置残余阻碍当前更优结构，允许直接删除或收口。

## 本轮建议优先收口的具体点

这些不是可选点，而是优先级很高的真实产品工程抓手：

1. `athlete --version`
   - 要么直接走 commander / package 级 fast path
   - 要么至少不依赖完整 runtime 初始化
2. `athlete --help`
   - 输出稳定
   - 不混入运行时异常
3. `athlete doctor`
   - 缺 key、网络问题、provider 问题、配置错误要分开提示
   - 不要只吐底层异常
4. `config show / get / set / path`
   - 输出格式和错误提示要稳定
   - 版本处理要明确
5. `/runtime` 和 closeout
   - 要能告诉用户当前在等什么、慢在哪、最近做了什么、是否在恢复

## 本轮明确禁止

1. 禁止顺手加新通道、新工具、新 agent 角色。
2. 禁止把产品工程做成“只改 README”。
3. 禁止为了省事继续让 `cli.ts` 长胖。
4. 禁止吞错误、模糊错误、把真实失败说成成功。
5. 禁止把运行透明度做成口号，不落到可读输出。
6. 禁止为了旧错误路径长期保留脏兼容分支。
7. 禁止把第 7 轮混成“再来一轮大重构核心架构”。

## 验收标准

只有同时满足以下条件，才能算本轮完成：

1. 文档已经定义新的产品行为、配置处理策略与旧残余清理边界。
2. 失败测试先补过，并且能证明旧实现不满足新要求。
3. fast path、配置处理、错误提示、运行透明度都有真实实现。
4. `npm.cmd run check` 和 `npm.cmd test` 通过。
5. 用户从安装、启动、报错、恢复、查看运行状态这几个角度看，产品感明显上升。
6. 旧错误命令/输出/配置残余不再继续污染主路径。

## 最终汇报格式

最终汇报必须包含：

1. 启动链改了什么。
2. 哪些 fast path 新增了。
3. 配置处理策略怎么做的，哪些旧残余被清理了。
4. 用户可读错误与运行透明度怎么提升了。
5. 先补了哪些失败测试。
6. 哪些内容被明确留到后续而没有混进本轮。
