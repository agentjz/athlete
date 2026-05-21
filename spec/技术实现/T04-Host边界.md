# Host 边界

Host 负责把产品入口接到 agent turn。

当前入口：

- CLI agent
- CLI spec
- interactive shell
- Telegram

Host 不负责模型策略。

Host 不负责工具内部实现。

Host 工具注册边界：

- `src/host/toolRegistry.ts`

`runHostTurn` 只接收 `extraTools` 和 `runtimePromptState`，不在 turn 生命周期里拼工具 registry。

隔离模式通过 host 边界注入额外工具和 prompt 状态。当前隔离模式是 `kitty spec`。

