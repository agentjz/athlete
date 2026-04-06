# ADR-0002：强主 Agent 起步，预留多 Agent 边界

## 背景

Athlete 当前最强的价值来自耐跑主 Agent。

同时，复杂任务又确实需要 subagent、teammate、background、worktree。

## 决策

1. 主 Agent 仍是系统核心。
2. 多 Agent 是按需能力，不是默认军团模式。
3. 下一阶段优先补“总指挥层”，不是先做大规模 swarm。

## 后果

- 能保住当前耐跑底盘
- 以后还能继续扩到多 Agent
- 不会过早进入复杂协作失控状态
