# P13 session 是任务现场

## 原则

session 不是聊天记录附件，而是任务现场。

## 为什么

Athlete 的核心价值之一是长任务不中断。

如果 session 只是普通历史消息：

- 续跑价值会很弱
- 压缩后容易丢失关键状态
- 长任务恢复会越来越不可靠

## 在 Athlete 里的含义

session 里应该能承接：

- 消息历史
- todo 状态
- verification 状态
- task state

## 当前对应

- `src/agent/session.ts`
- `src/agent/session/taskState.ts`
- `src/agent/verification.ts`
