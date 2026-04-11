# runtime rules

## 作用

运行时规则是 Athlete 的机器约束层。

## 当前包含

- 计划先行
- inbox 注入
- verification 状态机
- finalize / closeout gating
- continuation / compression
- tool error recovery
- runtime transition 模型

## 不该放进来的东西

- 具体任务拆分算法
- 具体 skill 内容
- 某个单一工具的内部实现

## 当前与收口直接相关的规则

- 变更型动作默认要求先 `todo_write`
- 文件改动和 mutating shell 会把 session 推进到 verification required
- 轻量交付物允许用定向 `read_file` / auto-readback 完成轻量验证
- acceptance / verification 统一消费机器 signal，而不是分散反推某个工具名
- continuation 后仍然读取持久化的 `pendingPaths`，不会因为 slice 切换就忘记“还有哪些输出待验”
- 当收口条件已满足时，task board closeout 工具会被隐藏，避免 `task_list` / `task_get` / `task_update` 无意义循环
- 当 todo 已全部完成时，runtime 不再继续鼓励补写 `todo_write`
- continue / recover / yield / pause / finalize 必须带结构化 reason code，而不是只靠零散字符串
- 最近一次关键 runtime 决策持久化到既有 checkpoint 真相源，不新增平行 JSON
- one-shot CLI 收尾输出必须带稳定 machine closeout contract，而不是只打印 session id
- 交互式 `quit` 如果发现运行中的后台进程，必须先进入 kill-or-continue 二次确认

## 当前 signal 规则

acceptance / verification 当前统一识别的结果类型至少包括：

- `http_endpoint_verified`
- `web_page_verified`
- `document_read_completed`
- `structured_artifact_valid`

换 browser 实现、换 document 引擎、换 provider 时，不应重写 acceptance gate 主体，只能换 adapter 或 signal 生产方式。

## 当前代码落点

- `src/agent/acceptance/signals.ts`
  - acceptance signal 归一化
- `src/agent/acceptance/evaluate.ts`
  - 只消费 signal、file checks、command checks
- `src/agent/verification/state.ts`
  - verification 真相源
- `src/agent/verification/signals.ts`
  - lightweight verification / auto-readback
- `src/cli/support.ts`
  - one-shot closeout report
- `src/cli.ts`
  - CLI 终态输出

## 下一阶段要求

总指挥层可以提出“下一步做什么”，但运行时规则仍决定“现在允不允许这样做”。
