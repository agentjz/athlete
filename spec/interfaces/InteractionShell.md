# InteractionShell

## 作用

`InteractionShell` 是共享交互控制层和具体外壳之间的正式边界。

它让 Athlete 的交互 session loop 可以复用同一个大脑，同时替换 CLI、桌面等不同壳。

## 当前真实能力

### 参与者

- `InteractiveSessionDriver`: 共享交互控制器
- `InteractionShell`: 壳总接口
- `ShellInputPort`: 输入端口
- `ShellOutputPort`: 输出端口
- `InteractionTurnDisplay`: turn 展示端口

### 当前契约语义

#### `ShellInputPort`

负责：

- 读取普通输入
- 读取 multiline 输入
- 绑定 interrupt 事件
- 为共享 driver 提供退出确认时所需的普通输入

不负责：

- 决定 task / runtime 真相
- 自己执行 agent turn

#### `ShellOutputPort`

负责：

- 输出 `plain / info / warn / error / dim / heading / tool / interrupt`
- 保持壳自己的展示风格

不负责：

- 修改 session 真相
- 决定本地命令语义

#### `InteractionTurnDisplay`

负责：

- 接收 turn 生命周期内的 `AgentCallbacks`
- 展示流式 assistant / reasoning / tool 状态
- 在 turn 结束或中断时 flush / dispose

#### `InteractionShell`

负责把上面三部分组装给共享 driver 使用。

共享 driver 可以基于这套输入/输出契约实现：

- 普通命令输入
- multiline 输入
- interrupt
- quit 前二次确认

## 当前 CLI 实现

- `src/shell/cli/readlineInput.ts`
- `src/shell/cli/output.ts`
- `src/shell/cli/turnDisplay.ts`
- `src/shell/cli/shell.ts`

CLI 当前通过这些适配器接入：

- `readline`
- `process.stdin` / `process.stdout`
- `chalk`
- spinner / stream renderer

这些都必须留在 CLI shell 内，不进入共享 driver。

## 规则

1. `InteractiveSessionDriver` 不能依赖 `readline`、stdio、`chalk`。
2. shell 只能提供输入、输出和 turn 展示适配，不能把控制面状态偷搬到壳里。
3. 本地命令的语义应落在共享交互层，shell 只负责把结果显示出来。
4. interrupt 的来源可以因壳不同而不同，但共享 driver 的 abort 语义必须一致。

## 未来方向

- 桌面壳可以实现自己的 `ShellInputPort`，例如输入框提交、多行编辑器、停止按钮。
- 桌面壳可以实现自己的 `ShellOutputPort` / `InteractionTurnDisplay`，例如富文本消息区和状态面板。
- 未来如果出现 web / mobile 壳，也应优先复用这组契约，而不是复制一套 session loop。
