# fixture 规范

## 原则

fixture 只保留能说明问题的最小状态。

## 推荐 fixture 类型

- task board 样例
- protocol request 样例
- team inbox 样例
- worktree index 样例
- compact / resume session 样例
- skill metadata 样例

## 规则

1. 一个 fixture 只服务一个测试主题。
2. 不把大量无关状态塞进同一个 fixture。
3. 真实 bug 的 fixture 优先长期保留。
