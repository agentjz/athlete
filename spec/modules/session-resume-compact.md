# session / resume / compact

## 作用

这一层负责保护 Athlete 的“长任务可继续”能力。

## 当前能力

- session 持久化
- resume 继续最近任务现场
- request context 压缩
- continuation 自动续跑
- todo / taskState / verificationState 跨 slice 持续生效

## 当前边界

Athlete 当前的记忆重点是：

- 当前项目
- 当前任务
- 当前 turn 相关状态
- 当前待验证输出 `pendingPaths`
- 最近一次 verification 结果

它不是跨项目的人格记忆。

## 当前实现约束

- continuation 会复用已有 session，而不是重新发明 todo / verification 状态。
- compact 只压缩请求上下文，不抹掉任务板、todo、verification 这些真相源。
- 收口判断可以依赖持久化的 `verificationState.pendingPaths`，不能只看当前 slice 的临时 `changedPaths`。
- `checkpoint.flow.lastTransition` 会随 session 持久化，保留最近一次关键 runtime 决策的结构化原因。

## Resume / Reset Contract

- `resume` 的语义是继续现有任务现场。
- `quit` 只是退出当前聊天窗口，不主动清空项目运行时状态。
- 显式 `reset` 会清空当前项目 `.athlete/` 下的运行时状态，并删除当前项目相关的持久化 session。
- 一旦 `reset` 成功，`resume` 不应恢复已经 reset 掉的运行时。
- 如果 objective 明确变化，checkpoint 进度必须重置，避免旧任务进度污染新任务。
- externalized tool-result references 和 verification pending paths 仍然是优先的可恢复锚点，但 reset 会主动销毁这一层锚点。
- runtime transition reason code 也属于 checkpoint 真相源的一部分，resume / continuation 读取它，而不是再造平行恢复提示。

## 下一阶段要求

未来可以增加更强的恢复能力，但必须遵守：

1. 项目事实优先于抽象记忆。
2. 记忆是辅助，不是第二真相源。
3. 不能破坏现有 continuation / compact / resume 的稳定边界。
4. destructive reset 必须保持显式、可理解、不可与普通 quit 混淆。
