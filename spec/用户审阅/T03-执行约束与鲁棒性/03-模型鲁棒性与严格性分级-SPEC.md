# 模型鲁棒性与严格性分级-SPEC

## 1. 本版目标

本版把执行底座稳定在四条正式约束：

- 该严的严：高风险路径继续 fail-closed。
- 该松的松：低风险路径仅对 unknown args 做可控宽容。
- 该截断就截断：provider recover 与 managed continuation 都必须受资源上限约束，并在 Lead 主路径上回主控复核。
- 该收就收：委派链路必须受显式入口、机器硬约束、执行边界、事件唤醒与回主复核约束。

目标不是“整体放松”，而是“正确性优先下的可用性与可收口性”。

## 2. 严格性分级矩阵（L0/L1/L2）

| 分级 | 适用路径 | unknown args 处理 | 不可放松项 |
| --- | --- | --- | --- |
| L0 | `read` / `state-low` | 允许宽容：剥离 unknown 后继续执行，并写入 warning 观测字段 | `required/type/enum` 错误仍阻断 |
| L1 | `state-medium` | 默认阻断，返回 `INVALID_TOOL_ARGUMENTS` | 默认不接受全局放松 |
| L2 | `write/destructive/high-risk` | 强阻断 fail-closed | 不允许通过配置关闭严格校验 |

判定口径：

- L2：`mutation=write` 或 `risk=high` 或 `destructive=true`
- L1：`mutation=state && risk=medium && destructive=false`
- L0：其余路径

## 3. 停机与资源治理

### 3.1 Provider recover 预算

- 默认：`maxAttempts=6`、`maxElapsedMs=120000`
- 超限记录：`pause.provider_recovery_budget_exhausted`
- 必含字段：`attemptsUsed/maxAttempts/elapsedMs/maxElapsedMs/lastError`
- Lead 主路径：命中后写入结构化记录并立即回主调度复核，不把本轮 turn 直接终止为 `paused`
- 非 Lead（如 teammate/subagent）执行：保持正式 `pause` 收口，避免隐藏失败

### 3.2 Managed turn slice 预算

- 默认：`maxSlices=8`（与 `maxContinuationBatches` 对齐）
- 默认时长上限：`maxElapsedMs=180000`
- 超限记录：`pause.managed_slice_budget_exhausted`
- 必含字段：`slicesUsed/maxSlices/elapsedMs/maxElapsedMs`
- Lead 主路径：命中后写入结构化记录并回主调度复核，再决定下一轮动作；不以预算命中直接终止主循环
- 非 Lead 执行：保持正式 `pause` 收口

### 3.3 Subagent 资源治理（替代旧式工具次数预算）

- Subagent 正常停止原因只有：任务完成、执行边界命中、用户中断、工具/Provider 真实失败、上下文需要压缩后仍不可继续。
- 不再用低工具调用次数或低模型轮次作为正常研究任务的硬预算；工具调用次数只允许作为异常级死循环保护，不能在常规路径上误杀任务。
- 执行边界由 execution boundary 统一管理：runtime boundary、idle boundary、worker command timeout/stall。
- 成本治理应通过 provider usage / token / 金额统计接入正式 cost boundary；没有真实成本数据时，不允许伪造“成本预算”作为停机真相源。
- 上下文治理通过 context window、summary、compaction 处理；上下文接近危险区时优先压缩，不直接把 subagent 判定为失败。
- Subagent 被边界暂停时必须写入结构化 boundary reason，并回 Lead 复核；事实来源是 execution closeout，不是 wake signal。

### 3.4 委派评估、机器硬约束与回主复核（增加）

- 关键词不再单独触发委派。
- 委派只能来自 Lead 的显式工具调用；机器只检查并发、执行边界、回主屏障和必要参数等硬约束。
- 每次委派完成或超限后，必须回主控复核，再决定下一步。

### 3.5 委派等待语义（增加）

- Lead 主路径：命中 `wait_for_existing_work` 时不把 turn 终止为对外 `paused`。
- 运行节奏：Lead 派出后台、队友或子代理后，等待期间不再进入模型旁路；机器层挂起等待 execution closeout 事件。
- Wake signal 只负责唤醒，不是真相源；Lead 醒来后必须读取 execution closeout、inbox、任务板等事实再判断下一步。
- 等待期间的理想体感不是“总指挥停机”，也不是“总指挥反复查状态”，而是“Lead 挂起；worker 完成、失败、超时或被边界暂停后发出事件；机器层再唤醒 Lead 合流复核”。

## 4. 幂等 terminate 语义

`background_terminate` 对已终态对象（`completed/failed/timed_out/aborted`）必须：

- 幂等成功返回，不抛错；
- 不二次 close，不改写终态真相；
- 返回 `already_terminal=true`、`idempotent=true`。

运行中对象仍按原语义执行终止并 closeout。

## 5. 可观测与可测试要求

- strictness 分层结果写入协议元数据：tier 与 unknown 剥离 warning。
- resource boundary 命中必须通过结构化 reason 可读可审计；Lead 路径还必须可追溯“回主复核”。
- subagent 不得因低工具调用次数或低模型轮次提前停止；只有真实执行边界、成本边界、上下文边界或错误 closeout 可以让它回主复核。
- 委派闸门拒绝必须可结构化解释（拒绝码 + 拒绝原因）。
- 关键断言优先结构化字段（`reason.code`、预算计数字段、状态字段），不依赖文案碎片。

## 6. 验收标准

同时满足以下条件才可收口：

- provider 抖动不会无限 `active`：Lead 在预算命中后回主复核继续推进，非 Lead 进入可见 `pause`。
- strictness 分层符合 L0/L1/L2 契约，且 L0 仅放松 unknown。
- `background_terminate` 对终态对象幂等成功且不改写真相。
- 委派不再由关键词单点触发，必须来自 Lead 显式工具调用，并通过机器硬约束检查。
- subagent 不再受旧式工具次数预算误杀；执行边界命中会强制返回 Lead 且可结构化审计。
- 委派后必须先回主控复核，不能同链路无限深挖。
- 委派进行中时，Lead 不对外停机，也不消耗模型轮次做旁路工作；机器层静默等 execution 事实变化，状态变化后再合流复核。
- 文档、测试、实现三者一致，无“代码先改文档后补”尾巴。

