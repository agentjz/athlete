# Provider 适配与 GPT-5.4 接入

## 文档目的

本文描述 Deadmouse 当前的 provider 适配边界、GPT-5.4 接入路径、配置归属和验证结果。

## 模块目标与当前状态

当前模型接入已经按正式结构收口为：

- 通用请求协议层
- provider capability/profile 层
- wire API adapter 层

当前实现已正式支持 GPT-5.4，并保留 OpenAI-compatible chat provider 的适配能力。

## 正式边界

主要代码边界如下：

- `src/agent/provider.ts`
- `src/agent/provider/contract.ts`
- `src/agent/provider/responsesAdapter.ts`
- `src/agent/provider/chatCompletionsAdapter.ts`
- `src/agent/api.ts`
- `src/config/runtime.ts`
- `src/config/store.ts`
- `src/cli/commands/doctor.ts`

## 术语

- `通用请求协议层`：turn 主流程看到的统一模型调用边界。
- `provider capability/profile`：根据 provider 与 model 决定 wire API、超时、fallback 和 reasoning 策略。
- `wire API adapter`：把统一请求映射成 `responses` 或 `chat.completions` 协议，再归一回统一响应结构。

## 真相源与状态归属

provider 相关正式状态当前归属如下：

- 运行配置来自 `src/config/store.ts`
- `.deadmouse/.env`、环境变量和 config file 由 `src/config/runtime.ts` 归一为 runtime config
- provider 能力判断由 `src/agent/provider.ts` 统一给出

当前不存在宿主私有 provider 配置入口，也不依赖外部临时认证目录作为正式运行入口。

## 主路径

当前模型请求主路径如下：

1. 配置系统解析 provider、model、base URL、API key 和运行策略。
2. `resolveProviderCapabilities(...)` 判断 wire API、超时、reasoning 与 recovery fallback。
3. `src/agent/api.ts` 依据 capability 选择 `responsesAdapter` 或 `chatCompletionsAdapter`。
4. adapter 将具体协议响应归一为统一的 `AssistantResponse`。
5. `runTurn` 继续沿统一响应结构处理工具调用、文本结果和 closeout。

## 当前能力结论

从代码现状看，当前能力已经固定为：

- `provider === openai` 或 `model === gpt-5.4` 时，默认走 `responses`
- DeepSeek 模型继续走 `chat.completions`
- GPT-5.4 默认使用更长的 request timeout 与 doctor probe timeout
- doctor 与真实请求链路共用同一套 provider 选择与 base URL 规则

## 失败路径与异常路径

当前明确处理：

- 不再把 GPT-5.4 错误地落回 chat completions 默认路径
- 慢中转站使用更宽松的超时，不因探测超时过早误判失败
- 运行配置只认正式配置入口，不在 CLI、宿主或工具内部重读第二套配置
- 多个 base URL 候选时，兼容“not found / 405”类失败后的替代候选重试

## 测试与验证

当前主要由以下测试保护：

- `tests/provider-capability.test.ts`
- `tests/provider-runtime-config.test.ts`
- `tests/doctor-provider-probe.test.ts`
- `tests/provider-and-tool-observability.test.ts`

同时，当前仓库已经完成：

- 真实 Responses API 请求验证
- 真实 Agent 回合验证

## 当前落地决定

当前 provider 接入的正式决定如下：

- provider 差异收在 capability/profile 与 adapter 层，不再塞回 turn 主流程。
- GPT-5.4 当前以 `responses` 作为正式接入协议。
- `.deadmouse/.env` 与统一配置系统是唯一正式运行配置入口。
- 增加 provider 时，仍沿 capability/profile/adapter 三层结构接入，不回到 provider-specific 特判堆叠。

