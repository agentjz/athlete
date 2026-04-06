# workspace / isolation

## 作用

工作区隔离负责避免并行任务互相污染。

## 当前能力

- allowed roots
- task 与 worktree 绑定
- worktree 创建、保留、删除

## 规则

1. 共享根目录适合读和轻量改动。
2. 并行改动优先进入独立 worktree。
3. task 是逻辑隔离，worktree 是目录隔离，两者不能混为一谈。

## 下一阶段要求

总指挥层需要会判断：

- 什么时候共享目录就够了
- 什么时候必须派到独立 worktree
