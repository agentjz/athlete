# socratic.md

目标：Socratic 是 Kitty 的第一个正式 workflow 扩展。它用于用户围绕学习资料提问、理解、记录卡点，并沉淀个人知识库。

Socratic 不属于默认核心。它只通过 `super` 模式进入。

## 扩展身份

- [x] Socratic 是独立 workflow 扩展。
- [x] Socratic 有 manifest。
- [x] manifest id 是 `socratic`。
- [x] manifest 声明版本。
- [x] manifest 声明入口。
- [x] manifest 声明 hook 位。
- [x] manifest 声明 workspace。
- [x] manifest 声明给模型看的短说明。
- [x] Socratic 通过 workflow ecology 进入 registry。
- [x] Socratic 通过 registry 被 `super` 发现。
- [x] `agent` 模式不加载 Socratic。
- [x] 核心不写 Socratic 特判。

## 技术接入

- [x] Socratic 通过 extension protocol 接入。
- [x] Socratic 位于 workflow 扩展族群。
- [x] Socratic 通过统一 hook 位接入。
- [x] Socratic 不修改 Agent 主循环。
- [x] Socratic 不修改默认工具清单。
- [x] Socratic 不污染默认核心提示词。
- [x] Socratic 复用 `read`、`edit`、`write`、`bash`。
- [x] Socratic 的上下文只在 `super` 可见。
- [x] Socratic 的输出短、可行动、可记录。
- [x] Socratic 失败记录真实事实，不打碎 `agent`。

## 文件结构

- [x] `.kitty/socratic/<sessionId>/manifest.md` 记录扩展空间说明。
- [x] `.kitty/socratic/<sessionId>/material/` 放用户指定的学习资料。
- [x] `.kitty/socratic/<sessionId>/goals/` 放学习目标和 checklist 总纲。
- [x] `.kitty/socratic/<sessionId>/questions/` 放用户问过什么、Kitty 怎么解释、用户怎么理解、引用了哪些材料。
- [x] `.kitty/socratic/<sessionId>/frictions/` 放卡点、难点、反复卡住类型。
- [x] `.kitty/socratic/<sessionId>/preferences/` 放用户学习偏好。
- [x] `.kitty/socratic/<sessionId>/notes/` 放正式学习笔记。
- [x] `.kitty/socratic/<sessionId>/index/` 放材料索引和轻量目录。
- [x] `.kitty/socratic/<sessionId>/sessions/` 放学习连续性摘要。
- [x] 文件结构属于 Socratic 扩展，按 session 隔离。

## 学习材料

- [x] 用户把学习资料放进 `.kitty/socratic/<sessionId>/material/`。
- [x] 材料不全量塞进上下文。
- [x] 用户提出目标或问题后，再按目标、章节、关键词读取材料。
- [x] 回答优先基于材料。
- [x] 材料找不到时，模型可以补充解释。
- [x] 补充解释要和材料事实区分。

## 学习目标

- [x] 用户可以自然说想学什么。
- [x] Kitty 通过提问帮助用户确认聚焦点。
- [x] 聚焦点可以是书、章节、概念、问题或材料目录。
- [x] 当前聚焦点保存为学习目标。
- [x] 学习目标是当前学习 checklist 总纲。
- [x] checklist 记录要学的点、已学过的点和需要回头看的点。
- [x] 用户改变目标时，更新当前 checklist。

## 学习经历

- [x] 记录用户问过什么。
- [x] 记录 Kitty 怎么解释。
- [x] 记录用户当时怎么理解。
- [x] 记录解释引用的原文材料。
- [x] 记录用户在哪里卡住。
- [x] 记录用户为什么卡住。
- [x] 记录哪种解释方式有效。
- [x] 每次学习交互后，由模型判断是否更新学习经历。
- [x] 学习经历用于下次继续，不变成机器替模型做决策。

## 用户偏好

- [x] 记录用户喜欢的解释方式。
- [x] 记录用户不喜欢的解释方式。
- [x] 记录用户容易理解的例子类型。
- [x] 记录用户对笔记的偏好。
- [x] 记录用户对节奏、深度和引用材料的偏好。
- [x] 偏好来自真实学习过程，不靠问卷硬填。
- [x] 每次学习交互后，由模型判断是否更新用户偏好。

## 学习笔记

- [x] 笔记记录用户认可的理解。
- [x] 用户用自然语言表达想沉淀时，模型判断是否写入正式笔记。
- [x] 笔记可以记录材料观点、Kitty 的解释和用户自己的理解。
- [x] 普通聊天不自动变成正式笔记。
- [x] 学习经历和正式笔记分开。
- [x] 笔记可被后续学习读取。

## 持续学习

- [x] 下次继续时能看到当前学习目标。
- [x] 下次继续时能看到 checklist。
- [x] 下次继续时能看到用户问过什么。
- [x] 下次继续时能看到之前怎么解释。
- [x] 下次继续时能看到用户怎么理解。
- [x] 下次继续时能看到卡点和偏好。
- [x] 长材料通过索引和懒加载继续工作。
- [x] 上下文变长时，当前学习桌面仍然简短。

## 用户体验

- [x] 用户说“我想学这本材料”，Kitty 能开始建立学习目标。
- [x] 用户说“我想学第一章”，Kitty 能聚焦第一章。
- [x] 用户问问题，Kitty 优先回到材料找依据。
- [x] 用户听不懂，Kitty 能换角度解释。
- [x] 用户理解错，Kitty 能直接纠正。
- [x] 用户表达某个理解有价值，Kitty 能沉淀为笔记。
- [x] 用户下次回来，Kitty 能接着上次继续。
- [x] 用户越学，Kitty 越懂用户学习习惯。

## 验证

- [x] 验证 Socratic 只在 `super` 模式出现。
- [x] 验证 `agent` 模式不出现 Socratic 内容。
- [x] 验证 Socratic manifest 能被读取。
- [x] 验证 Socratic 通过 registry 被发现。
- [x] 验证 Socratic 通过通用 hook 位接入。
- [x] 验证 Socratic 文件结构完整。
- [x] 验证 `kitty super` 能得到 Socratic runtime facts。
- [x] 验证 `kitty agent` 不得到 Socratic runtime facts。
