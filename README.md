# 小猫智能体 Kitty

<p align="center">
  <strong>🐾 一个本地 agent 编程工作台：搜得到，看得懂，改得准，跑得通，记得住，能继续。</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@jun133/kitty"><img alt="npm" src="https://img.shields.io/npm/v/%40jun133%2Fkitty?color=111827&label=npm"></a>
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D20-339933">
  <img alt="typescript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-0f766e">
  <img alt="agent" src="https://img.shields.io/badge/mode-agent-7c3aed">
</p>

小猫智能体是给本地代码仓库使用的 agent harness。

它把模型、工具、上下文、会话、变更记录和验证事实收进一个稳定的本地编程体验里，让长任务可以被推进、保存、恢复和继续。

## ✨ 为什么是小猫智能体

小猫智能体的核心体验很明确：

- 🧭 一个 agent 主循环负责推进任务。
- 🛠️ 四个 core 工具完成基础编程闭环。
- 🧩 扩展能力通过 extension 进入，保持核心清楚。
- 🧠 Context 和 Session 专门负责连续性。
- 📌 机器层执行、记录、恢复事实；模型基于目标和证据判断路线。

## 🚀 当前能力

| 能力 | 当前事实 |
| --- | --- |
| 🧭 Agent 循环 | 模型、工具、session、收尾都在同一个主循环里推进 |
| 🧠 Context | 项目上下文、运行时上下文、工作记忆、长上下文压缩 |
| 💾 Session | 会话记录、checkpoint、todo、恢复现场 |
| 🔌 Provider | OpenAI-compatible provider、请求恢复、连接诊断 |
| 🛠️ Core tools | `read`、`edit`、`write`、`bash` |
| 🧩 Extensions | `todo`、`worktree`、`network`、`spec` |
| 📐 Spec 模式 | `requirements.md`、`design.md`、`tasks.md`、`notes.md` 和隔离 worktree |
| 💬 产品面 | CLI、交互终端、Telegram 私聊服务 |
| 📎 证据记录 | 事件、终端日志、崩溃记录、文件变更记录 |

## ⚡ 快速开始

安装依赖并构建：

```bash
npm.cmd install
npm.cmd run build
```

初始化当前项目：

```bash
kitty init
```

启动交互式 agent：

```bash
kitty
```

执行一次明确任务：

```bash
kitty "检查这个仓库并修复失败测试"
```

进入 spec 工作流：

```bash
kitty spec
```

## ⌨️ 常用命令

| 命令 | 用途 |
| --- | --- |
| `kitty` | 进入默认 agent 交互，或直接接收一次性 prompt |
| `kitty agent` | 显式进入 agent 模式 |
| `kitty spec` | 进入 requirements -> design -> tasks -> implement -> validate 工作流 |
| `kitty resume [sessionId]` | 恢复最近会话或指定会话 |
| `kitty sessions` | 查看最近会话 |
| `kitty config show` | 查看从 `.kitty/.env` 解析出的当前运行配置 |
| `kitty config path` | 查看当前项目 `.kitty/.env` 路径 |
| `kitty changes` | 查看记录的文件变更 |
| `kitty undo [changeId]` | 撤销最近一次或指定变更 |
| `kitty diff [path]` | 查看当前 git diff |
| `kitty doctor` | 检查运行环境 |
| `kitty telegram serve` | 启动 Telegram 私聊服务 |

## 🛠️ 工具体系

Core 工具固定为四个：

| Tool | 作用 |
| --- | --- |
| `read` | 读取文件和上下文事实 |
| `edit` | 精确修改已有文件 |
| `write` | 写入新文件或完整内容 |
| `bash` | 搜索、Git、构建、测试和本地命令 |

Extension 是可启用、可禁用、独立存在的工具集合：

| Extension | 作用 |
| --- | --- |
| `todo` | 会话级 todo 写入和可见 checklist |
| `worktree` | Git worktree 事实、创建、保留和删除 |
| `network` | HTTP session、请求、探测、下载、trace、OpenAPI 检查 |
| `spec` | durable spec 文档、状态、任务、checkpoint 和隔离 worktree |

默认 agent 会启用 `todo`、`worktree`、`network`。`spec` 不随默认 agent 自动启用；需要 spec 工作流时使用 `kitty spec`。

查看配置：

```bash
kitty config show
```

扩展开关在 `.kitty/.env` 的 `KITTY_EXTENSION_*` 中维护。

## ⚙️ 配置

项目运行配置只从 `.kitty/.env` 读取。初始化后按 `.kitty/.env` 填写当前启用的 provider、模型、API key 和 profile。

`.kitty/.env` 放当前启用的 provider 和 API key，同时保留 YLS、TTAPI、DeepSeek 三组 provider preset 注释块，方便直接切换。Telegram、扩展开关和运行时配置也在 `.kitty/.env` 与 `.kitty/.env.example` 中保持同一结构。

当前支持的主要环境配置包括：

- `KITTY_PROVIDER`
- `KITTY_BASE_URL`
- `KITTY_MODEL`
- `KITTY_API_KEY`
- `KITTY_PROFILE`
- `KITTY_REASONING_EFFORT`
- `KITTY_MAX_OUTPUT_TOKENS`
- `KITTY_TELEGRAM_TOKEN`
- `KITTY_TELEGRAM_ALLOWED_USER_IDS`
- `KITTY_TELEGRAM_PROXY_URL`
- `KITTY_TELEGRAM_API_BASE_URL`

## 🗺️ 项目结构

| 模块 | 路径 |
| --- | --- |
| Agent 主循环 | `src/agent/` |
| Context | `src/context/` |
| Session | `src/session/` |
| Provider / Config | `src/provider/`, `src/config/` |
| Core tools | `src/tools/` |
| Extensions | `src/extensions/` |
| Spec runtime | `src/spec/` |
| Host 边界 | `src/host/` |
| CLI / Shell / Telegram | `src/cli/`, `src/shell/`, `src/telegram/` |
| Runtime UI | `src/runtime-ui/` |
| Observability | `src/observability/` |
| Specs | `spec/` |
| Tests | `tests/` |

## 🧪 开发

```bash
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:core
npm.cmd run verify
```

交付前运行：

```bash
npm.cmd run verify
```

## 📜 项目规则

当前架构事实、项目偏好和宪法原则都在 `spec/`。

重要入口：

- `spec/用户审阅/项目规则/用户偏好.md`
- `spec/用户审阅/系统核心/核心地图.md`
- `spec/用户审阅/宪法原则/`
- `spec/技术实现/`

Spec、代码和测试共同描述同一个当前现实。项目入口、配置、文档和测试都跟随当前实现同步维护。
