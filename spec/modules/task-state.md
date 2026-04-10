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
5. `status / blockedBy / assignee / owner / worktree` 不是孤立看的，lead orchestrator 会联合 `TeamStore`、`BackgroundJobStore`、`WorktreeStore` 派生任务 lifecycle。
6. 同一个任务的 machine lifecycle 至少要能区分：
   - `blocked`
   - `ready`
   - `active`
   - `completed`
7. `ready` 还要继续区分是谁能接：
   - lead
   - 指定 teammate
   - nobody（缺失或冲突时 fail-closed）
8. 如果 task 仍绑定失效 worktree、指向缺失 background job、或保留了不存在 teammate 的 handoff，系统必须阻断继续派工。

## 下一阶段演进方向

任务系统后续如要继续长：

- 优先先扩现有 task truth
- 不新造平行 orchestration plane
- 继续让 lifecycle / ownership / handoff 由机器从既有真相源派生
