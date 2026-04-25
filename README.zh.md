# deadmouse-agent

<p align="center">
  <strong>一个以 Lead 为方向盘、以机器层为账本和刹车的任务执行 harness</strong>
</p>

<p align="center">
  <a href="./README.md">English README</a>
</p>

<p align="center">
  <img alt="lead harness" src="https://img.shields.io/badge/lead-harness-c0c0c0?style=for-the-badge&labelColor=111827">
  <img alt="durable runtime" src="https://img.shields.io/badge/durable-runtime-9ca3af?style=for-the-badge&labelColor=1f2937">
  <img alt="gpt-5.4 supported" src="https://img.shields.io/badge/GPT--5.4-supported-d6d3d1?style=for-the-badge&labelColor=292524">
  <img alt="checkpoint persisted" src="https://img.shields.io/badge/checkpoint-persisted-64748b?style=for-the-badge&labelColor=0f172a">
  <img alt="runtime stats" src="https://img.shields.io/badge/runtime-stats-d4af37?style=for-the-badge&labelColor=1c1917">
</p>

Deadmouse 不是让机器层替 Lead 模型干活，也不是让机器层变成第二个总指挥。它的设计是给 Lead 配上账本、边界、循环守卫、验证门和收口门：用户给目标，Lead 负责理解目标、选路线、调工具、派 team 或 subagent、开后台、回收结果、判断下一步；机器层负责把这些执行行为变成有记录、有状态、有证据的过程。

方向盘始终在 Lead 手里，但 pending 不能假装完成，执行通道不能无限跑，工具失败不能原地解释，没有合流不能交付，没有验证不能收口。简单说，Deadmouse 不是自动驾驶，也不是审批系统；它是一个把大模型执行过程逼到可持续、可恢复、可验证状态的 agent harness。

## 开发指令

| 命令 | 含义 |
| --- | --- |
| `npm.cmd install` | 安装项目依赖 |
| `npm.cmd run typecheck` | TypeScript 类型检查 |
| `npm.cmd run build` | 构建 CLI 到 `dist/cli.js` |
| `npm.cmd run check` | 执行 `typecheck + build` |
| `npm.cmd test` | 全量测试，包含 `check + test:core` |
| `npm.cmd run test:build` | 构建测试产物到 `.test-build/` |
| `npm.cmd run test:core` | 执行核心测试 |
| `npm.cmd run verify:skills-api` | 验证 skills API |
| `npm.cmd run verify:runtime-context-api` | 验证 runtime lightweight context API |
| `npm.cmd run verify:runtime-checkpoint-api` | 验证 runtime checkpoint API |
| `npm.cmd run verify:runtime-observability-api` | 验证 runtime observability API |
| `npm.cmd run verify:mineru-documents-api` | 验证 MinerU 文档能力 API |
| `npm.cmd run dev` | 用源码启动 CLI |
| `npm.cmd run dev -- "帮我看看这个项目"` | 用源码执行一次 one-shot 任务 |
| `node dist/cli.js` | 用构建产物启动交互模式 |
| `node dist/cli.js "帮我看看这个项目"` | 用构建产物执行一次 one-shot 任务 |
| `node dist/cli.js telegram serve` | 用构建产物启动 Telegram 服务 |

## 用户指令

| 命令 | 含义 |
| --- | --- |
| `npm install -g @jun133/deadmouse` | 全局安装 CLI |
| `deadmouse init` | 初始化当前项目的 `.deadmouse/` |
| `deadmouse` | 进入交互模式 |
| `deadmouse "帮我看看这个项目"` | 执行一次任务 |
| `deadmouse run "帮我看看这个项目"` | 显式执行一次任务 |
| `deadmouse resume [sessionId]` | 恢复最近一次或指定会话 |
| `deadmouse sessions -n 20` | 查看最近会话 |
| `deadmouse diff [path]` | 查看当前项目 Git diff |
| `deadmouse changes [changeId]` | 查看变更记录 |
| `deadmouse undo [changeId]` | 回滚最近一次或指定变更 |
| `deadmouse config show` | 查看当前配置 |
| `deadmouse config path` | 查看配置文件路径 |
| `deadmouse doctor` | 检查本地配置和 API 连通性 |
| `deadmouse telegram serve` | 启动 Telegram 私聊服务 |

## 发布指令

| 命令 | 含义 |
| --- | --- |
| `npm login` | 登录 NPM |
| `npm whoami` | 确认当前发布账号 |
| `npm.cmd run check` | 发布前执行类型检查和构建 |
| `npm.cmd test` | 发布前执行全量测试 |
| `npm pack --dry-run` | 预览即将发布到 NPM 的文件 |
| `npm version patch` | 发布补丁版本 |
| `npm version minor` | 发布次版本 |
| `npm version major` | 发布主版本 |
| `npm publish` | 发布到 NPM |
