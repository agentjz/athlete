# Kitty

<p align="center">
  <strong>A local agent workbench for durable coding sessions.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@jun133/kitty"><img alt="npm" src="https://img.shields.io/npm/v/%40jun133%2Fkitty?color=111827&label=npm"></a>
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D20-339933">
  <img alt="typescript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-0f766e">
  <img alt="agent" src="https://img.shields.io/badge/mode-agent-7c3aed">
</p>

Kitty 是一个本地 agent 编程工作台。

它的目标很直接：搜得到、看得懂、改得准、跑得通、记得住、能继续。

## Highlights

- **Single agent loop**: 一个主循环驱动模型、工具、session 和收口。
- **Durable context**: 工作记忆、session brief、checkpoint 和长上下文压缩让任务能继续。
- **Four core tools**: `read`、`edit`、`write`、`bash` 覆盖基础编程闭环。
- **Pluggable extensions**: `todo`、`worktree`、`network`、`spec` 作为可启用工具集合存在。
- **Provider-ready**: 配置、provider adapter、重试和连接诊断集中管理。
- **Runtime evidence**: observability 只记录事实，不替模型判断路线。

## Install

```bash
npm.cmd install
npm.cmd run build
```

本地运行：

```bash
npm.cmd run dev
```

构建后运行：

```bash
node dist/cli.js
```

## CLI

```bash
kitty
kitty "inspect this repository"
kitty agent
kitty agent "fix the failing tests"
kitty resume <sessionId>
kitty sessions
kitty config show
kitty doctor
kitty telegram serve
```

## Tools

Core 工具固定为：

| Tool | Purpose |
| --- | --- |
| `read` | 读取文件和上下文事实 |
| `edit` | 精确修改已有文件 |
| `write` | 写入新文件或完整内容 |
| `bash` | 搜索、Git、构建、测试和本地命令 |

扩展工具由配置控制：

| Extension | Purpose |
| --- | --- |
| `todo` | 会话级 todo 列表 |
| `worktree` | Git worktree 事实和操作 |
| `network` | HTTP、下载、trace、OpenAPI 检查 |
| `spec` | 单文档 spec 工作流 |

## Configuration

查看配置：

```bash
kitty config show
```

设置扩展开关：

```bash
kitty config set extensions '{"todo":true,"worktree":false,"network":false,"spec":false}'
```

初始化项目配置：

```bash
kitty project init
```

## Architecture

| Area | Path |
| --- | --- |
| Agent loop | `src/agent/` |
| Context | `src/context/` |
| Session | `src/session/` |
| Provider / Config | `src/provider/`, `src/config/` |
| Core tools | `src/tools/` |
| Extensions | `src/extensions/` |
| Host boundary | `src/host/` |
| CLI / Shell / Telegram | `src/cli/`, `src/shell/`, `src/telegram/` |
| Runtime UI | `src/runtime-ui/` |
| Observability | `src/observability/` |
| Specs | `spec/` |
| Tests | `tests/` |

## Development

```bash
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:core
npm.cmd run verify
```

`npm.cmd run verify` 是交付前的标准验证入口。

## Project Rules

项目规则、宪法原则和当前架构事实都在 `spec/`：

- `spec/用户审阅/项目规则/用户偏好.md`
- `spec/用户审阅/宪法原则/`
- `spec/用户审阅/系统核心/核心地图.md`
- `spec/技术实现/`

Spec、代码和测试必须描述同一个当前现实。
