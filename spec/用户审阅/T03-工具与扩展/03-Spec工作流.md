# Spec 工作流

`spec` 是 extension，并且有隔离的 `kitty spec` 模式入口。

它负责 durable spec 工作流。普通 agent 模式不自动进入 spec 工作流；spec 模式会注入 spec workflow prompt、spec tools，并在存在 active spec 时切到隔离 worktree。

spec 模式不是普通 agent 模式加几句提示词。它有自己的阶段工具面：

- 没有 active spec 时，工具面是 `read`、`bash` 加 spec 工具，用于 research、创建 spec 和记录 notes。
- requirements、design、tasks 没有全部确认前，仍然只开放 `read`、`bash` 加 spec 工具。
- 进入 implement、validate 或 archive，且 requirements、design、tasks 都已确认后，才开放 `read`、`edit`、`write`、`bash` 加 spec 工具。

这样新功能不会在没有 spec、没有 notes、没有确认文档时直接落代码。

Spec 的主流程是三阶段：

- requirements
- design
- tasks

implement、validate、archive 是后续执行和收口状态。

一个 spec 由状态和四个文档组成：

- `requirements.md`
- `design.md`
- `tasks.md`
- `notes.md`

状态记录当前 stage、status、确认标记、任务进度、会话绑定和当前 checkpoint。

`notes.md` 是事实笔记和审阅痕迹；requirements、design、tasks 是整理后的工作文档。

创建 spec 时四个文档会带有空骨架。骨架只给审阅和填写位置，不替用户编造需求、设计或任务。

checkpoint 保存 spec 状态、四个文档和隔离 worktree 的代码位置。restore 只恢复 spec 自己的文档和隔离 worktree，不重置主仓库。

任务拆解进入 `tasks.md`，不需要独立 plan 工具。
