# interactive terminal

## 作用

交互终端是 Athlete 的表现层外壳，不是控制面真相源。

## 当前真实能力

### 当前分层

- `src/interaction/`: 共享交互控制层
- `src/shell/cli/`: CLI shell 适配层
- `src/ui/`: CLI 文本格式化、runtime summary 和兼容导出

### 共享交互控制层职责

- 驱动交互 session loop
- 处理普通输入和 multiline 分支
- 处理本地命令路由
- 在 `quit / q / exit` 时检查当前项目仍在运行的后台进程，并做退出确认
- 管理 turn in-flight 状态与 abort controller 生命周期
- 接线 `runManagedAgentTurn`
- 维护当前 session 的内存态，并在 turn 完成后接收最新 session

### 当前 CLI shell 职责

- 提供 persistent input / multiline input
- 绑定终端 interrupt
- 展示 assistant 流式输出
- 展示 tool 调用和状态消息
- 展示 banner、launch hints、dim/warn/plain/stderr 风格
- 展示当前 session 的 runtime summary

## 规则

1. UI 不能反向定义 task、protocol、worktree、checkpoint、runtimeStats 等控制面事实。
2. spinner、stream renderer、本地命令格式化都只属于表现层。
3. Athlete 可以替换 UI，但不能因此破坏 runtime kernel。
4. `/runtime`、`/stats`、`/仪表盘` 只是 `SessionRecord.runtimeStats` 的只读 summary 视图。
5. UI 可以读取并展示真相源，但不能绕过真相源另造状态。
6. 交互 session loop 不能直接绑死 `readline`、`process.stdin/stdout`、`chalk` 这类 CLI 细节。
7. shell 只能提供输入、输出和 turn 展示适配，不能自己发明 task / protocol / runtime 真相。

## Quit Boundary

- `quit / q / exit` 不是“无条件立刻退出”。
- 共享交互层会先检查当前项目仍在运行的后台进程：
  - `background job`
  - `teammate worker`
- 如果没有运行中的后台进程：
  - 直接退出会话
- 如果有运行中的后台进程：
  - 先把它们列出来
  - 只允许两个结果：
    - 确认退出：杀掉全部后台进程，再退出
    - 取消退出：保持当前 CLI 和后台进程继续运行
- kill 失败时必须 fail-closed：
  - 不退出
  - 明确告诉用户哪些 PID 还活着

这个规则属于共享交互控制层，不属于单个 shell 外壳。
## 当前本地命令入口

- `/session`
- `/config`
- `/todos`
- `/tasks`
- `/team`
- `/background`
- `/worktrees`
- `/inbox`
- `/runtime`
- `/stats`
- `/仪表盘`
- `/reset`

## Runtime Summary 展示范围

当前交互态最小 runtime summary 包含：

- session health
- model request count
- model wait total
- tool call count
- tool duration total
- yield / continuation / recovery / compression count
- externalized result count / bytes
- top tools

## Reset Boundary

- `/reset` 是显式 destructive local command，不是普通的窗口关闭动作。
- `/reset` 清空当前项目 `.athlete/` 下的运行时状态，但保留 `.athlete/.env` 和 `.athlete/.env.example`。
- `/reset` 还会删除当前项目相关的持久化 session，因此 `resume` 不应恢复已经 reset 掉的运行时。
- `/reset` 会尽量先通过正式 worktree / process 清理路径收尾，再删除状态目录。
- reset 行为必须落在 runtime / project state 层，UI 只能触发它，不能自己维护一套平行 reset 状态。

## 当前边界

### 共享边界

- `InteractiveSessionDriver`: 共享交互控制器
- `InteractionShell`: 壳适配接口
- `ShellInputPort`: 普通输入 / multiline 输入 / interrupt 订阅
- `ShellOutputPort`: info / warn / plain / dim / interrupt 等展示输出
- `InteractionTurnDisplay`: turn 期间的流式展示适配

### 当前 CLI 接线

- `src/ui/interactive.ts`: CLI 入口薄壳，只负责组装 shell、打印 intro、启动 driver
- `src/shell/cli/readlineInput.ts`: CLI 输入适配
- `src/shell/cli/output.ts`: `chalk` + stdio 输出适配
- `src/shell/cli/turnDisplay.ts`: spinner + stream renderer 适配
- `src/interaction/localCommands.ts`: 共享本地命令语义
- `src/interaction/exitGuard.ts`: 退出前后台进程检查与 kill-or-continue 语义

## 当前展示边界

交互终端当前只负责把这些状态展示清楚：

- task board
- teammate 状态
- background 状态
- skill load 状态
- runtime summary

但它不负责发明这些状态。

交互终端当前还负责把退出确认展示清楚：

- 哪些后台进程仍在运行
- 用户当前是在“继续运行”还是“kill 后退出”的分支
- kill 失败时哪些 PID 仍未退出

## 未来方向

- 桌面壳应直接实现 `InteractionShell` 契约，而不是复用 CLI 的 `readline` / stdio 细节。
- 桌面壳可以自己提供输入框、停止按钮、流式消息区和状态面板。
- 只要继续复用 `InteractiveSessionDriver`，桌面壳与 CLI 壳就应共享同一套本地命令、turn 驱动和中断语义。
