# Provider 适配与 GPT-5.4 接入

## 1. 实现目标

这一版的实现目标不是继续给 `src/agent/api.ts` 和 `src/agent/provider.ts` 叠加特判，而是正式把模型接入重构为“通用请求协议层 + provider 能力适配层”。

实现后应满足以下目标：

- 核心 turn 执行链只依赖统一的请求协议，不依赖 DeepSeek / OpenAI 具体差异。
- Provider / model-specific 的协议、事件、fallback、reasoning、超时和能力差异都被收进 adapter / profile 层。
- GPT-5.4 在当前中转入口上优先走真实可跑通的协议，不预设必须走 `chat.completions`。
- 项目运行时正式配置入口只有 `.athlete/.env` + 现有配置系统，`TT-config auth` 只允许作为迁移时参考，不允许成为长期运行依赖。

## 2. 术语和边界

### 通用请求协议层

这是核心执行系统看到的唯一模型调用边界。它只关心：

- 本轮输入是什么
- 可用工具是什么
- 正常输出是什么
- 工具调用是什么
- 失败和重试怎么表达

它不负责：

- 判断某个 provider 用 `responses` 还是 `chat.completions`
- 填 provider-specific 字段
- 管理某个模型自己的 fallback 习惯

### Provider 能力适配层

这是 provider-specific 行为的正式容器。它负责：

- 选择 wire API
- 映射 provider-specific 请求体
- 解析 provider-specific 流式事件或非流式响应
- 暴露模型能力、默认策略、恢复策略和超时策略

它不负责：

- 决定任务计划
- 执行工具
- 管理 session 历史的业务语义

### Wire API

指具体走哪条协议，例如：

- OpenAI Responses API
- OpenAI-compatible Chat Completions API

Wire API 是 adapter 的实现细节，不是 kernel 的业务判断条件。

## 3. 实现前必须先定死的文档

实现前必须以这些文档为准：

- `spec/用户审阅/GPT-5.4接入与Provider适配.md`
- `spec/用户审阅/宪法原则/15-provider必须可替换.md`
- `spec/用户审阅/宪法原则/16-配置只能有一个入口.md`
- `spec/技术实现/总体架构.md`
- `spec/技术实现/关键模块/配置系统.md`

如果代码现状与这些边界冲突，以这组文档为准，并在实现完成后让文档、测试、代码重新一致。

## 4. 实现前必须先定死的测试与验收

测试优先抓根本问题，不先抓文案和细枝末节。第一批必须先定死的失败测试和验收如下。

### 失败测试

- 当 provider 是 GPT-5.4 且实际可用协议是 `responses` 时，核心调用链不能继续假设通用协议就是 chat completions。
- 当 provider-specific 字段变化时，核心 turn 主流程不需要改代码。
- 当运行时配置来自 `.athlete/.env` 时，系统不允许再偷偷读取 `TT-config auth` 形成第二配置入口。
- 当中转站响应变慢时，请求不会因为过短超时而被误判为 provider 不可用。
- 当 provider base URL 需要标准化时，`doctor` 和真实请求链路使用同一套规则，避免一个能通、一个走错路径。

### 验收测试

- 单元测试：provider profile 能根据配置选择正确 wire API、默认策略和恢复策略。
- 单元测试：responses adapter 能把文本输出、函数调用、函数参数流式增量正确归一到统一 `AssistantResponse`。
- 单元测试：chat-completions adapter 仍能服务需要该协议的 provider，不与 GPT-5.4 绑定。
- 集成测试：`doctor` 基于真实 runtime config 完成连通性探测，并允许更长超时。
- 真实验证：一次真实 Responses API 请求成功返回结果。
- 真实验证：一次真实 Athlete Agent 任务回合成功完成，证明新接入不是“只会 ping”。

## 5. 模块拆分

推荐按下面的职责拆分，不要求文件名完全一致，但必须守住边界。

### A. Provider contract

建议承载：

- 通用请求输入类型
- 通用响应类型
- streaming / non-streaming 的统一抽象
- adapter 统一接口

建议落位：

- `src/agent/provider.ts` 继续只保留 profile / contract 相关内容，或拆成 provider 子目录后由单一入口导出

### B. Provider profiles / capabilities

建议承载：

- provider 名称与模型名归一化
- 默认 wire API
- fallback 能力
- reasoning 能力
- timeout / retry 策略默认值

当前可直接演进的入口：

- `src/agent/provider.ts`

### C. Wire API adapters

至少需要区分：

- Responses adapter
- Chat Completions adapter

它们负责把通用请求映射成具体协议，再把具体协议响应归一成统一 `AssistantResponse`。

当前可直接演进的入口：

- `src/agent/api.ts`
- `src/agent/responseNormalization.ts`
- `src/agent/session/messages.ts`

### D. Runtime config and doctor

负责：

- 从 `.athlete/.env` 解析 provider、model、base URL、API key 和必要请求策略
- 让 `doctor` 与真实 adapter 能力保持同一套入口判断

当前可直接演进的入口：

- `src/config/schema.ts`
- `src/config/runtime.ts`
- `src/config/init.ts`
- `src/cli/commands/doctor.ts`

### E. Turn integration

`runTurn` 只负责消费统一 adapter，不再自己知道某个 provider 的请求体或协议差异。

当前可直接演进的入口：

- `src/agent/runTurn.ts`
- `src/agent/retryPolicy.ts`

## 6. 每个模块的职责与非职责

### 通用请求协议层

职责：

- 接收本轮消息、工具、回调、abort signal
- 调用已选定的 adapter
- 接收统一响应并回到 turn 主流程

非职责：

- 拼 provider-specific body
- 识别某家协议的流式事件名
- 管理某家 provider 的特殊字段

### Responses adapter

职责：

- 面向 `responses` 协议构造请求
- 读取 `output_text`、函数调用和函数参数增量
- 把结果归一到统一响应结构

非职责：

- 直接改 session 语义
- 代替 config 层决定当前 provider 是谁

### Chat Completions adapter

职责：

- 服务仍需要 OpenAI-compatible chat completions 的 provider
- 处理对应协议的 tool call 和内容解析

非职责：

- 假装自己是所有 provider 的通用协议
- 替 GPT-5.4 强行兜底，除非 profile 明确允许

### Provider profile / capability 层

职责：

- 描述“这个模型怎么接、默认该怎么跑”
- 暴露超时、wire API、fallback、reasoning 等策略

非职责：

- 承载 turn 业务逻辑
- 直接执行 API 调用

### 配置系统

职责：

- 保证运行真相源只有 `.athlete/.env` 和现有配置系统
- 产出所有宿主共享的统一 runtime config

非职责：

- 从临时调试目录读第二套配置
- 在宿主、CLI、tool 内部各自重新读环境变量

## 7. 可复用、可改造、可参考的成熟方案

这一版优先复用而不是重做：

- 现有 `openai` Node SDK，直接承接 `responses` 和 `chat.completions` 两条协议能力。
- 现有 `src/config/` 配置加载链，不另造配置入口。
- 现有 `doctor`、observability、retry、abort 和 turn 生命周期。
- 现有 `AssistantResponse`、tool registry、session 持久化和 closeout 机制。

需要改的不是这些成熟轮子本身，而是它们之间当前过于耦合的接线方式。

## 8. 推荐执行顺序

1. 先补文档对应的失败测试和 contract 测试，定死“通用协议层”和“adapter 层”的边界。
2. 再把 provider profile 从当前混合逻辑中整理出来，明确定义 wire API、fallback、timeout 等策略。
3. 再把 `responses` 适配做成正式 adapter，并把 GPT-5.4 接到这条链路上。
4. 再把 `chat.completions` 适配从“默认通用路径”降级为“某些 provider 的具体 adapter”。
5. 再统一 `doctor` 与 runtime 请求链路的 base URL 和 timeout 规则。
6. 最后跑真实 API 验证和真实 Agent 回合验证。

## 9. 验证与收口方式

只有满足下面这些条件，才能算收口：

- 自动测试证明 kernel 不再依赖 provider-specific 分支。
- 自动测试证明 GPT-5.4 这条链路会选择正确 wire API。
- `.athlete/.env` 可以独立承载 GPT-5.4 所需配置，不再依赖外部临时认证目录。
- `doctor` 可以在更长超时下正确探测当前中转站。
- 真实 Responses API 请求成功。
- 真实 Agent 任务回合成功，且不是只完成启动或空响应，而是真实走完整条接入链路。

如果只做到“裸接口能返回一句话”，还不能算完成。

## 10. 风险与待确认事项

- 当前中转站不是官方 OpenAI 入口，响应更慢，timeout、重试和错误分类必须更保守。
- GPT-5.4 在当前中转站上应优先以真实可跑通协议为准，不能先入为主假设 chat completions 一定可用。
- 如果要求这一轮完全保持 DeepSeek 旧行为不变，改造复杂度会明显上升，应在开始实现前明确兼容优先级。
- 真实 Agent 验证任务应选一个稳定、可重复、低外部依赖的场景，否则会把 provider 接入问题和别的随机问题混在一起。
