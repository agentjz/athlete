# task state

## 作用

任务状态是 Athlete 控制面的核心。

## 当前字段重点

- `status`
- `blockedBy`
- `blocks`
- `assignee`
- `owner`
- `checklist`
- `worktree`

## 当前规则

1. `assignee` 表示应该谁做。
2. `owner` 表示现在谁正在做。
3. 被阻塞任务不能启动。
4. 已完成任务不能随意重开。

## 下一阶段演进方向

任务系统要支持总指挥层，优先考虑增加：

- 优先级
- 父子任务
- 重试次数
- 产物引用
- review / verify 要求

这些演进必须建立在现有持久化任务板上，而不是另起一套任务宇宙。
