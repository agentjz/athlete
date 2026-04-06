# SessionStore

## 作用

SessionStore 负责保存和恢复任务现场。

## 最小职责

- 创建 session
- 追加消息
- 保存 todo / verification / taskState
- 加载既有 session

## 不负责

- 任务板真相
- teammate roster
- worktree 生命周期

## 关键要求

session 恢复不能破坏 Athlete 的耐跑能力。
