export const TELEGRAM_HELP_TEXT = [
  "/help            查看 Telegram 使用说明",
  "/stop            停止当前正在执行的 Telegram 任务，bot 服务不会退出",
  "/session         查看当前 Telegram 会话绑定的 session ID",
  "/config          查看当前运行配置",
  "/todos           查看当前 todo 状态",
  "/runtime         查看当前 session 运行摘要",
  "/tasks           查看任务板",
  "/team            查看队友状态",
  "/background      查看后台任务",
  "/worktrees       查看隔离工作区",
  "/inbox           查看 lead 收件箱",
  "/multi           Telegram 不支持交互式多行模式，请直接发送完整消息",
  "",
  "文件用法：",
  "- 直接把文件发到私聊，Athlete 会下载并接入当前 session。",
  "- 你可以说“分析我刚发的文件”或“把 README.md 发回给我”。",
  "- 需要停止当前任务时，使用 /stop。",
  "",
  "提示：本地终端里的退出/重置命令不会在 Telegram 执行。",
].join("\n");

export const TELEGRAM_BLOCKED_LOCAL_COMMAND_TEXT =
  "本地终端的退出/重置命令不会在 Telegram 执行。Telegram 里请使用 /stop 停止当前任务。";
