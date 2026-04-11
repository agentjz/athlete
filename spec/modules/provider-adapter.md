# provider adapter

## 作用

provider adapter 负责把 Athlete 的请求发送到具体模型服务，并把 provider-specific 能力差异收敛成稳定的 capability profile。

## 当前策略

- 优先 OpenAI-compatible
- provider-specific fallback、reasoning 能力、request body 差异、recovery model 选择都下沉到 provider 层
- 运行时对网络错误、超时、上下文过长仍有恢复策略，但主循环只消费 provider capability，不再写死某家模型名

## 规则

1. provider 能换，主循环不跟着重写。
2. provider 问题先在 adapter 层处理，不外溢到任务语义层。
3. 模型 fallback 属于运行时策略，不属于业务模块。
4. kernel 可以知道“当前 request model 是什么”，但不应该知道“某个具体 provider 为什么要这样切”。
5. reasoning request body、tool 兼容 fallback、failure streak recovery model 都属于 provider capability。

## 当前实现落点

- `src/agent/provider.ts`
  - `resolveProviderCapabilities()`
  - `buildProviderRequestBody()`
  - `selectProviderRequestModel()`
- `src/agent/api.ts`
  - 只消费 provider capability，不再直接判断 `deepseek-reasoner -> deepseek-chat`
- `src/agent/retryPolicy.ts`
  - 通过 provider 层选择 recovery request model
- `src/agent/session/messages.ts`
  - reasoning content 是否参与请求，也通过 provider capability 决定
- `src/config/store.ts`
  - 统一解析 `provider / baseUrl / model`

## 当前状态说明

- 代码默认配置与模板示例仍以 DeepSeek 系列为起点
- 项目本地 `.athlete/.env` 可以把有效 provider / base URL / model 覆盖到其他 OpenAI-compatible 服务
- 但 DeepSeek-specific 行为已经不在 kernel 主干里硬编码
- adapter 层允许出现具体 provider 名词；主循环和业务规则层不允许依赖这些名字

## 下一阶段要求

总指挥层、closeout、workflow guard、acceptance gate 都不依赖某一家 provider 特性。
