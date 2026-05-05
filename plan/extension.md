# extension.md

目标：Kitty 有两个产品模式。`agent` 保持干净；`super` 承载当前真实扩展。

当前真实扩展只有 workflow 族群，当前真实 workflow 只有 Socratic。

## 产品模式

- [x] `agent` 是默认模式。
- [x] `agent` 只暴露 `read`、`edit`、`write`、`bash`。
- [x] `agent` 不加载扩展。
- [x] `agent` 不出现扩展提示词。
- [x] `super` 是扩展模式。
- [x] `super` 启动后加载当前启用扩展。
- [x] `super --resume` 可以用扩展模式继续已有 session。

## 扩展协议

- [x] 有正式 `extension protocol`。
- [x] protocol 是扩展系统唯一入口规则。
- [x] protocol 描述 manifest、registry、hook、workspace、observability。
- [x] protocol 不包含具体 workflow 业务。
- [x] protocol 不知道 Socratic 的学习细节。
- [x] protocol 只定义扩展如何声明、发现、挂载、运行、记录。
- [x] protocol 明确机器只加载、执行、记录事实。
- [x] protocol 明确模型负责是否使用扩展能力。

## 扩展生态

- [x] 有正式 `extension ecology`。
- [x] ecology 当前只汇总 workflow 扩展。
- [x] ecology 不把 workflow 写死进 Agent 主循环。
- [x] ecology 输出统一扩展清单。
- [x] ecology 是 `super` 的装配层，不是默认核心的一部分。
- [x] ecology 不替模型选择路线。

## manifest

- [x] 每个当前扩展必须有 manifest。
- [x] manifest 是扩展身份。
- [x] manifest 声明扩展 id。
- [x] manifest 声明扩展名称。
- [x] manifest 声明扩展版本。
- [x] manifest 声明扩展入口。
- [x] manifest 声明扩展来源。
- [x] manifest 声明需要的 hook 位。
- [x] manifest 声明工作空间。
- [x] manifest 声明给模型看的简短说明。
- [x] manifest 不写模型策略。
- [x] manifest 不写核心特判。

## registry

- [x] 有统一 registry snapshot。
- [x] registry 是 `super` 本轮已发现扩展的事实。
- [x] registry 记录扩展 id。
- [x] registry 记录扩展版本。
- [x] registry 记录扩展入口。
- [x] registry 记录扩展启用状态。
- [x] registry 记录扩展来源。
- [x] registry 记录 manifest 路径。
- [x] `agent` registry 为空。
- [x] `super` 通过 registry 看到 Socratic。
- [x] 不为 Socratic 开专门核心入口。

## hook

- [x] 核心只提供少数固定 hook 位。
- [x] hook 位是核心绕到扩展再回来的口子。
- [x] hook 位不接管核心。
- [x] hook 位不替模型决定策略。
- [x] hook 位不写具体 workflow 业务。
- [x] hook 位不污染默认核心提示词。
- [x] 扩展只能挂到 protocol 允许的 hook 位。
- [x] hook 输入是当前运行事实。
- [x] hook 输出是短、可行动、可记录的事实。
- [x] hook 失败只记录事实，不打碎默认 `agent`。

## 加载流程

- [x] `agent` 启动不走扩展加载。
- [x] `super` 启动读取 registry。
- [x] `super` 读取启用扩展 manifest。
- [x] `super` 建立扩展工作空间。
- [x] `super` 汇总扩展给模型看的短说明。
- [x] `super` 把扩展 hook 挂到固定位置。
- [x] `super` 运行时记录扩展 hook 事实。
- [x] `super` 不把扩展详细内部状态全塞进上下文。

## 扩展工作空间

- [x] 每个当前扩展有独立 workspace。
- [x] workflow workspace 按 session 隔离。
- [x] workspace 路径由 manifest 声明。
- [x] workspace 落在 `.kitty/` 运行状态目录。
- [x] workspace 保存扩展自己的材料、状态、记录、输出。
- [x] 扩展之间不共享隐式状态。

## 扩展能力

- [x] 扩展可以提供提示片段。
- [x] 扩展可以提供自己的记录空间。
- [x] 扩展可以提供用户入口。
- [x] 扩展复用基础四工具。
- [x] 扩展能力不污染 `agent`。
- [x] 扩展能力只在 `super` 可见。

## 观测记录

- [x] 记录 hook 触发。
- [x] 记录 hook 失败。
- [x] 记录扩展工作空间路径。
- [x] 记录只服务排查和恢复。
- [x] 记录不变成第二个脑子。

## 架构边界

- [x] Agent 主循环只接收 runtime prompt state。
- [x] Agent 主循环不 import Socratic。
- [x] Socratic 不 import Agent 主循环。
- [x] Socratic 不改默认工具清单。
- [x] Socratic 不写默认核心提示词。
- [x] `super` 是产品入口。
- [x] extension ecology 是扩展装配层。
- [x] protocol 是边界。
- [x] hook 是挂载点。
- [x] registry 是发现事实。
- [x] manifest 是扩展身份。

## 验证

- [x] 验证 `agent` 模式无扩展。
- [x] 验证 `agent` 模式仍然只有四工具。
- [x] 验证 `super` 模式读取 registry。
- [x] 验证 `super` 模式加载 Socratic manifest。
- [x] 验证扩展通过统一 hook 位接入。
- [x] 验证 Agent 主循环不 import Socratic。
- [x] 验证 Socratic 不需要核心特判。
- [x] 验证 Socratic workspace 结构完整。
- [x] 验证 `kitty agent` 不带扩展状态。
- [x] 验证 `kitty super` 带 Socratic 扩展状态。
