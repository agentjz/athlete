# 机器层约束与 Harness 设计

## 这份文档回答什么问题

这份文档说明 Deadmouse 当前依靠哪些机器层约束来保证任务可执行、可续跑、可验证和可收口。

## 当前目标与状态

当前机器层已经按正式边界收口为六类约束：

- 稳定编辑语义
- 工具调用协议
- 命令执行运行时
- 错路拦截与回退路径
- 完成门、验证门和验收门
- 中断恢复与续跑
- 上下文治理与预防性压缩

这里的“机器层”指执行正确性约束，不指审批式安全系统。

Deadmouse 当前仍然只有两种正式模式：

- `agent`
- `read-only`

## 适用范围

这些约束直接作用于：

- `read_file / edit_file / write_file / apply_patch / run_shell`
- 共享 `runTurn` 主路径
- 会话现场中的 checkpoint、verification、acceptance 和 runtime stats
- 长任务的 continuation、压缩和恢复

## 范围外事项

当前明确不包含：

- 审批式权限流
- 复杂安全沙箱
- 额外的产品模式包装
- UI、TUI、Web 产品面

## 核心场景

### 1. 改文件

当前系统要求先读取文件，再基于正式 identity 和锚点发起编辑；文件已变化时，过期 identity 和过期锚点会失效。

### 2. 工具走错路

当前系统会在机器层拦截明显错路，例如：

- 用 `write_file` 覆盖已有文件
- 用 `run_shell` 直接读取文件内容
- 在文档读取场景退回错误工具路径

同时，工具参数现在统一走 prepare 阶段的正式参数 contract 校验。参数不是合法 JSON、缺字段、类型错误或携带未声明字段时，会在 prepare 阶段 fail closed，不会再进入 execute 阶段“碰运气”。

同时，`run_shell` 已按正式 runtime 返回结构化执行状态（`completed/failed/timed_out/stalled/aborted`）、截断标记和输出落盘路径，不再只返回一段裸文本；长输出也会在执行中受正式上界控制，而不是等命令结束后再临时截断。

`run_shell / background_run / background_check / background_terminate` 现在共用一套轻量 process protocol contract（`deadmouse.exec.v1`），正式暴露 start/read/terminate/exited/closed 的等价语义：前台命令是一次性 closed contract，后台命令是可 read/terminate 的运行中 contract。

### 3. 空结果或错误收口

当前系统不会把空 assistant 结果直接当成完成；验证、验收和状态门仍然是正式收口依据。

### 4. 中断、压缩与恢复

当前系统会保存现场，并在压缩或中断后沿正式恢复路径继续，而不是把任务打回从头开始。

会话现场中的 `checkpoint.flow.runState` 继续承担执行中归属：显式区分 busy / idle，并与 `pendingToolCalls` 联动变更；只有在 yield、pause、completed 或异常收口时才正式回到 idle。

## 验收标准

当前专项按下面的结果验收：

- 核心 harness 行为不依赖单一模型的临场发挥
- 读取、编辑、写回之间有正式稳定语义
- 常见错路会被机器层拦截并给出回退方向
- 非法工具参数会在 prepare 阶段稳定 fail closed，且不会误入 execute
- shell 执行具备结构化状态、截断标记和可追溯输出路径
- shell 与 background 执行具备统一 process contract 语义（含 terminate / closed 收口）
- 未验证、未满足验收条件时不能伪装完成
- 长任务能基于现场续跑和恢复

## 当前定稿

Deadmouse 当前已经把关键执行行为从“靠模型习惯”收回到“靠机器制度”。机器层约束现在服务的是正确性、恢复性和可验证性，而不是继续增加产品层包装。

