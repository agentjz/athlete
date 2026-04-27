# 机器层约束与 Harness 设计

## 文档目的

本文描述 Deadmouse 当前的机器层约束，说明这些约束落在什么代码边界上、由哪些状态承载、如何进入主路径，以及如何被测试保护。

## 模块目标与当前状态

当前机器层已经形成六类正式约束：

1. 稳定编辑语义
2. 工具调用协议
3. 错路拦截与回退路径
4. 完成门、验证门与验收门
5. 中断恢复与续跑
6. 上下文治理与压缩后恢复


## 正式边界

当前主要代码边界如下：

- `src/capabilities/tools/packages/files/editIdentity.ts`
- `src/capabilities/tools/packages/files/readFileAnchors.ts`
- `src/capabilities/tools/packages/files/editAnchor.ts`
- `src/capabilities/tools/packages/files/editAnchorMatch.ts`
- `src/capabilities/tools/packages/files/writeExistingFileGuard.ts`
- `src/capabilities/tools/packages/files/writeDiagnostics.ts`
- `src/capabilities/tools/core/blockingResult.ts`
- `src/capabilities/tools/packages/shell/runShellTool.ts`
- `src/capabilities/tools/core/toolArgumentContract.ts`
- `src/capabilities/tools/packages/shell/outputCapture.ts`
- `src/capabilities/tools/packages/background/backgroundTerminateTool.ts`
- `src/utils/commandRunner/run.ts`
- `src/execution/processProtocol.ts`
- `src/execution/boundary.ts`
- `src/execution/agentBoundary.ts`
- `src/capabilities/subagent/launch.ts`
- `src/capabilities/tools/packages/tasks/taskTool.ts`
- `src/agent/turn/toolBatch.ts`
- `src/agent/turn/loopGuard.ts`
- `src/agent/turn/pendingToolCalls.ts`
- `src/agent/turn/compactionRecovery.ts`
- `src/agent/runtimeTransition/`
- `src/agent/session/snapshot.ts`

这些模块都挂在现有 `src/agent/` 与 `src/capabilities/tools/` 边界内，没有另造额外的 harness 超级目录。

## 术语

- `稳定编辑语义`：读取、定位、修改、写回之间存在正式 identity 与锚点。
- `工具协议`：一次工具调用分为 `prepare -> execute -> finalize` 三个阶段。
- `错路拦截`：对明显错误的工具路径做机器层阻断，并给出回退方向。
- `完成门`：只有满足状态、验证和验收条件时，任务才允许收口。
- `恢复路径`：压缩、中断或异常后，沿正式状态继续推进而不是从头开始。

## 真相源与状态归属

机器层状态当前归属如下：

- `checkpoint.flow.pendingToolCalls`
- `checkpoint.flow.runState`
- `checkpoint.flow.compactionRecovery`
- `verificationState`
- `acceptanceState`
- `runtimeStats`
- `sessionDiff`

这些状态都持久化在 session snapshot 中，由 `src/agent/session/snapshot.ts` 统一读写和校验。

当前没有单独的审批状态文件、独立 closeout 真相源或宿主级恢复状态。

## 主路径

### 1. 稳定编辑语义

当前主路径为：

1. `read_file` 返回 `identity`、`anchors` 和 continuation 信息。
2. `edit_file` 要求 `expected_identity` 与 `edits[].anchor`。
3. 当前文件与读取时不一致时，直接以 stale identity 失败。
4. `apply_patch` 继续保留 patch 语义，不作为平行写工具体系扩张。

### 2. 工具协议与错路拦截

当前主路径为：

1. 工具先进入 registry 的 `prepare`。
2. `prepare` 统一完成参数 contract 校验和 guard；schema 不匹配时在 prepare fail closed，并带正式 blocked protocol。
3. 允许执行的调用进入 `execute`。
4. 结果经过 `finalize` 收口协议元数据。
5. 多工具批次由 `toolBatch.ts` 统一维护 `pendingToolCalls`、并行策略和结果顺序。

blocked 结果在 `finalize` 阶段统一经过 continuation exit 兜底：阻断结果必须包含可读 `hint` 与 `next_step`，避免机器层只给“不允许”而不给继续路径。

`loopGuard.ts` 不再把“同工具同参数”直接等同于坏循环。读取类工具先执行并观察结果，只有同动作、同参数、同结果连续重复且没有新进展时，才返回 `LOOP_GUARD_BLOCKED`；`read_inbox / list_teammates / background_check / task_list / worktree_events / shutdown_response` 等活状态轮询工具不走同参 preflight 硬拦，避免错过队友 closeout、后台完成或 protocol 状态变化。

`delegatedWorkWait.ts` 专门处理委派等待节奏：active delegated work 仍未完成时，Lead 不再进入模型旁路，也不再用工具批次反复查委派状态。机器层订阅 execution closeout 事件，并用账本 reconcile 作为兜底；没有事件就不喂 prompt，有完成、失败、预算耗尽、超时或 worker 退出信号后再唤醒 Lead 合流。

`run_shell` 在 execute 阶段继续走共享协议，但执行结果已扩展为正式 runtime 结构：状态、超时/中断标记、截断标记和输出落盘路径；长输出在执行中就被预览上界和落盘链路接管，而不是结束后再一次性裁切。

`run_shell` 不再因为命令被分类为可能长运行而强制切换到 `background_run`；后台执行只作为模型可见建议和独立工具能力保留，是否切换由模型基于任务上下文判断。

browser/web workflow 只作为工具排序、技能提醒和提示语义，不再通过 preflight gate 硬拦合法 shell、HTTP 或文件路径。网页工具排序以轻量 HTTP / download 能力优先，浏览器仍可见但不再被塑造成唯一正确路线。

skill runtime 只提供强提醒，不再提供 `SKILL_REQUIRED` 形式的工具硬门。缺失 skill 时，toolless reminder 必须逼迫模型立刻选择具体行动：加载技能、检查文件、确认路径、验证输入或交付证据结果；不能继续 analysis-only 空转。

orchestrator route 不再把 survey / teammate / background 任务直接自动分流。它只把这些通道作为 Lead 可见建议返回到 `self_execute`，由 Lead 判断是否委派、后台运行或直接执行。

`ensureTaskPlan` 现在只创建建议阶段和事实依赖，不再根据复杂度、关键词或背景命令预设 executor，也不在未发生真实委派前预创建 merge 阶段。merge 应由真实委派结果、后台结果或合流需求触发，而不是由机器预判触发。

coordination policy 不再作为 plan approval 或 shutdown request 的审批总开关。plan approval 按请求存在性、目标对象、状态等事实处理；shutdown request 交给 teammate state lock 检查，只有队友仍 working 或仍拥有活跃任务时才阻断。

Lead orchestration 遇到 active delegated work 时不进入模型旁路，也不对外 pause。机器层进入静默等待，只看 execution 是否仍 active；状态变化后再把控制权交回 Lead。这样机器层负责死事实，Lead 负责结果合流和下一步判断。

`leadReturnGate.ts` 负责 Lead 返回前的未完成工作硬门槛。只要 lead 发起的 teammate / subagent / background execution 仍 queued / running，managed turn 就交给 `delegatedWorkWait.ts` 静默等待；pending protocol request 仍 pending 时才回到 Lead 复核，而不是把“要不要继续盯”交还给用户。

该硬门槛必须受 managed slice 边界约束。达到边界后，managed turn 不直接 pause 给用户，而是注入一次 Lead hard-boundary review 输入，要求 Lead 复盘未完成项、已尝试路径和下一步策略；这保证机器持续鞭打但不代替 Lead 决策，也避免机器自循环。

`execution/boundary.ts` 定义统一执行边界协议 `deadmouse.execution-boundary.v1`。所有 `ExecutionStore.create(...)` 产生的 subagent、teammate、background execution 都会被规范化为同一协议：`returnTo=lead`、`onBoundary=return_to_lead_review`、`maxRuntimeMs`、`maxIdleMs`。命令执行读取该协议作为 timeout / stall 边界；agent 执行也由机器层执行 runtime / idle boundary，触边界时暂停 execution、写结构化 reason，并回 Lead review。`subagent/launch.ts` 是 Lead 启动子代理的统一入口，orchestrator dispatch 与 Lead-only `task` 工具都只创建 worker-backed execution，不再 inline 跑完子代理，也不替 Lead 判断父任务完成。执行输入仍保留边界说明，要求子执行交状态、证据和下一步选项，而不是宣布父任务完成。

acceptance route-change 文案现在必须要求模型说明已尝试或已验证内容，并选择下一步具体动作；工具执行失败的 `next_step` 统一要求三选一：改参数、换工具或换路线，禁止 explanation-only 空转。

`run_shell / background_run / background_check / background_terminate` 现在共享 `deadmouse.exec.v1` 的轻量 process protocol 元数据，正式表达前后台的 start/read/terminate/exited/closed 等价语义。

### 3. 完成门与恢复路径

当前主路径为：

1. 共享 turn 执行推进 checkpoint、verification 和 acceptance。
2. 空 assistant 可见结果不会被当成完成，而是进入 continue transition。
3. 压缩后连续 no-text/空响应会记录到 `compactionRecovery`。
4. 超出恢复阈值后进入正式 recovery 或 pause，而不是假装成功。

## 模块职责与非职责

### 机器层负责

- 保证编辑、写回和工具执行的形式正确
- 把关键运行状态落到正式真相源
- 在异常时给出正式失败、继续或恢复路径

### 机器层不负责

- 宿主产品面
- provider 产品策略
- 审批式安全流
- 平行真相源的维护

## 失败路径与异常路径

当前明确处理以下失败路径：

- stale identity、缺失锚点、重叠 edits、模糊定位
- `write_file` 覆盖已有文件被阻断并回退到 `edit_file`
- `run_shell` 直接读取文件内容被阻断并回退到 `read_file`
- `run_shell` 长输出在执行中自动控上界并落盘，避免把超长原文直接挤入上下文或在本地执行层无限堆积
- `run_shell` 或其他工具参数不满足 schema 时，在 prepare 阶段稳定 fail closed，并且 execute 不会被触发
- workflow hint 不再作为合法工具调用的硬阻断条件
- `run_shell` 不再因 long-running 分类默认返回 `PREFER_BACKGROUND`
- 缺失 skill 不再产生 `SKILL_REQUIRED` 工具阻断，只产生强推进提醒
- survey / teammate / background 路由不再自动派活，只返回 Lead 决策建议
- task planning 不再写死 executor，也不预判 merge
- coordination policy 不再拦截 Lead 的 plan decision 或 idle shutdown
- teammate shutdown 由 `team/stateLocks.ts` 的真实状态锁保护
- active delegated work 不再让 Lead 模型空转；机器层通过 delegated work wait 挂起等待 execution closeout 事件
- pending protocol request 和 running delegated execution 会触发 Lead 返回前硬门槛；达到 managed boundary 后必须回 Lead 复盘，而不是普通回答、用户确认或机器自循环
- subagent / teammate / background execution 统一带 `deadmouse.execution-boundary.v1`，执行到边界必须回 Lead review
- Lead-only `task` 工具只能启动 worker-backed subagent execution，不能 inline 跑完子代理，也不能让 teammate/subagent 继续开嵌套指挥链
- acceptance stalled summary 必须包含已尝试/已验证、下一步具体动作和禁止 explanation-only 空转的要求
- loop guard 拦截的是同动作同结果的无进展重复，不是同参轮询；活状态工具必须允许 Lead 查账本、查 inbox 和查后台状态
- tool execution failure 的 `next_step` 必须统一逼迫改参数、换工具或换路线
- blocked protocol 结果必须带继续出口；缺失 `hint` 或 `next_step` 时由 `blockingResult` 统一补齐
- `background_terminate` 通过统一 closeout contract 把后台执行收口为 `aborted`，不再依赖旁路状态
- 空 assistant 结果进入 continue，而不是完成
- 压缩后连续 no-text 响应进入恢复或 pause

## 测试与验证

当前主要由以下测试保护：

- `tests/machine-harness.test.ts`
- `tests/edit-anchors-and-feedback.test.ts`
- `tests/tool-batch-protocol.test.ts`
- `tests/loop-guard.test.ts`
- `tests/tools-convergence.test.ts`
- `tests/tool-governance.test.ts`
- `tests/compaction-recovery.test.ts`
- `tests/agent-recovery.test.ts`
- `tests/team-and-policy.test.ts`
- `tests/subagent-worker-launch.test.ts`

## 当前落地决定

当前机器层的正式决定如下：

- 文件编辑统一采用“文件级 identity + 行级锚点”。
- 写工具统一返回 `changedPaths`、diff、diagnostics 与 session diff 摘要。
- `pendingToolCalls`、`runState` 与 `compactionRecovery` 都进入正式 session 状态。
- `runState` 在活跃 turn 中默认继承 busy，只在 yield、pause、completed 或异常收口时正式回到 idle。
- `run_shell` 统一返回结构化 runtime 结果，并在长输出场景提供落盘路径。
- 后台运行保持为模型可选能力，不再由 `run_shell` 基于正则分类强制改道。
- 缺失技能保持为强提醒，不阻断合法工具；提醒必须要求模型下一轮做具体动作。
- 子代理、队友和后台调度保持为 Lead 可选路线，不由机器路由直接替 Lead 派发。
- 任务板只记录建议阶段、依赖和真实状态，不替 Lead 预选执行通道。
- coordination policy 保留为可读状态偏好，不作为审批式执行门；事实冲突由状态锁处理。
- Lead loop 遇到活跃委派工作时不推动模型合流准备，也不让 Lead 查状态；委派结果未回来时，机器层静默等待。
- Lead 返回前会检查未完成委派执行和 pending protocol request；未完成就继续鞭打 Lead 推进，到 hard boundary 后回 Lead 做复盘和再调度，不允许问用户是否继续。
- `ExecutionStore.create(...)` 统一为所有执行通道补齐 execution boundary，不允许出现无边界执行通道；agent lane 的 runtime/idle boundary 也由机器层暂停并回 Lead review。
- `task` 工具和 orchestrator 的 subagent 派发都收敛到 `subagent/launch.ts`，只返回 execution handoff，不返回伪完成内容。
- 循环守卫按结果签名判断无进展重复：静态读取同结果才阻断，结果变化视为进展；活状态轮询不因同参重复被通用 loop guard 硬拦，委派等待场景已经移到机器层事件等待，不再要求 Lead 在两批委派状态查询之间做自身推进。
- 工具失败和验收卡住都走统一推进鞭子：总结事实、换路行动、继续产出证据。
- tool 参数 contract 统一在 prepare 阶段校验，并以 blocked protocol 稳定收口。
- blocked protocol 统一提供 continuation exit，确保机器阻断服务继续推进而不是制造停滞。
- `run_shell / background_*` 统一返回 `deadmouse.exec.v1` process contract 元数据。
- `background_terminate` 成为正式 terminate surface，并把后台执行收口到统一 execution lifecycle。
- 不再保留只读运行模式；执行边界依靠工具治理、验证和收口约束。
- completion gate 继续绑定现有 verification、acceptance 与 checkpoint 主路径。

