# provider adapter

## 作用

provider adapter 负责把 Athlete 的请求发送到具体模型服务。

## 当前策略

- 优先 OpenAI-compatible
- 运行时对网络错误、超时、上下文过长有恢复策略

## 规则

1. provider 能换，主循环不跟着重写。
2. provider 问题先在 adapter 层处理，不外溢到任务语义层。
3. 模型 fallback 属于运行时策略，不属于业务模块。

## 下一阶段要求

总指挥层不依赖某一家 provider 特性。
