# Kitty

## 开发

| 命令 | 作用 |
| --- | --- |
| `npm.cmd install` | 安装项目依赖。 |
| `npm.cmd run build` | 构建 `dist/` 产物。 |
| `npm.cmd run typecheck` | 检查 TypeScript 类型。 |
| `npm.cmd run test:core` | 运行核心测试。 |
| `npm.cmd run verify:repo-contracts` | 检查仓库结构契约。 |
| `npm.cmd run verify` | 运行完整验证。 |

## CLI

| 命令 | 作用 |
| --- | --- |
| `node dist/cli.js` | 启动默认交互模式。 |
| `node dist/cli.js <prompt>` | 用默认模式执行一次提示。 |
| `node dist/cli.js agent` | 启动 Agent 交互模式。 |
| `node dist/cli.js agent <prompt>` | 用 Agent 模式执行一次提示。 |
| `node dist/cli.js super` | 启动 Super 交互模式。 |
| `node dist/cli.js super <prompt>` | 用 Super 模式执行一次提示。 |
| `node dist/cli.js super --resume <sessionId>` | 用 Super 模式恢复指定 session。 |
| `node dist/cli.js resume <sessionId>` | 用默认模式恢复指定 session。 |
| `node dist/cli.js sessions` | 列出最近的 session。 |

## Web

| 命令 | 作用 |
| --- | --- |
| `node dist/cli.js web` | 启动本地 Web 工作台。 |
| `node dist/cli.js web --host 127.0.0.1` | 指定 Web 监听地址。 |
| `node dist/cli.js web --host 127.0.0.1 --port 3000` | 指定 Web 监听地址和端口。 |
| `node dist/cli.js web --super` | 用 Super 模式启动 Web 工作台。 |
| `node dist/cli.js web --super --host 127.0.0.1 --port 3000` | 用 Super 模式启动指定地址和端口的 Web 工作台。 |

## Telegram

| 命令 | 作用 |
| --- | --- |
| `node dist/cli.js telegram serve` | 启动 Telegram 私聊服务。 |
| `node dist/cli.js telegram serve --super` | 用 Super 模式启动 Telegram 私聊服务。 |

## 配置

| 命令 | 作用 |
| --- | --- |
| `node dist/cli.js config path` | 显示配置文件路径。 |
| `node dist/cli.js project init` | 初始化当前项目的 `.kitty` 配置文件。 |
| `node dist/cli.js doctor` | 检查本地配置和模型连接。 |
| `node dist/cli.js version` | 显示 Kitty 版本号。 |

## 开发直跑

| 命令 | 作用 |
| --- | --- |
| `npm.cmd run dev -- agent` | 从源码启动 Agent 交互模式。 |
| `npm.cmd run dev -- agent <prompt>` | 从源码用 Agent 模式执行一次提示。 |
| `npm.cmd run dev -- super` | 从源码启动 Super 交互模式。 |
| `npm.cmd run dev -- super <prompt>` | 从源码用 Super 模式执行一次提示。 |
| `npm.cmd run dev -- super --resume <sessionId>` | 从源码用 Super 模式恢复指定 session。 |
| `npm.cmd run dev -- web` | 从源码启动 Web 工作台。 |
| `npm.cmd run dev -- web --super` | 从源码用 Super 模式启动 Web 工作台。 |
| `npm.cmd run dev -- telegram serve` | 从源码启动 Telegram 私聊服务。 |
| `npm.cmd run dev -- telegram serve --super` | 从源码用 Super 模式启动 Telegram 私聊服务。 |
