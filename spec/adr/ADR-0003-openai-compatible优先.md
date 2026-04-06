# ADR-0003：OpenAI-Compatible 优先

## 背景

Athlete 要做 harness，而不是绑死在某一家 provider 上。

## 决策

1. 当前 provider 接口优先兼容 OpenAI-compatible。
2. provider 选择属于配置问题，不属于业务设计问题。
3. 上层 runtime、tools、orchestrator 不依赖某一家的专属行为。

## 后果

- Athlete 更容易切换模型与服务商
- 后续扩展更稳定
