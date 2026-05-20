# 一个 agent 循环

Kitty 当前只有一个主体验：agent。

CLI、交互终端和 Telegram 都应进入同一条 host -> agent turn 主链路。

这个原则保护的是用户体验和实现边界：入口可以不同，主循环不能分裂。

当前落点：

- `src/agent/`
- `src/host/`
- `src/cli/`
- `src/interaction/`
- `src/shell/`
- `src/telegram/`
