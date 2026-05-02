# Trace 运行取证

Trace 是旁路取证案卷，不是新的真相源，也不是 Lead 的默认上下文。

## 现在的运行方式

每个 agent turn 会记录一条结构化案卷链：

- turn 开始
- 模型请求摘要和完整请求 artifact 引用
- 模型响应
- 工具调用
- 工具结果
- 外置工具结果 artifact 引用
- turn finalized / yielded / paused / recovered / failed

这些记录落在 `.kitty/traces/`，只通过显式只读工具查询。

## 和现有层的关系

- session 仍然是当前任务现场
- history 仍然是旧证据读取口
- observability 仍然是旁路运行事件
- ledger 仍然是正式执行状态
- trace 只把一次运行组织成可回放案卷
- runtime doctor 只汇总诊断视图

Trace 不替代这些层，也不成为另一份正式真相源。

## 禁止

- 不自动注入 Lead prompt
- 不自动总结策略
- 不自动判断下一步动作
- 不自动裁决失败责任层
- 不替代 session、history、observability 或 ledger

## 当前落地

`agent_trace_list` 和 `agent_trace_read` 是只读取证能力。Lead 如需查看 trace，必须显式调用。默认运行上下文不会携带 trace 内容。

`doctor runtime` 会汇总 trace session 数、event 数和最新 trace session，供开发者诊断。这个诊断结果仍然不进入正式裁决链。
