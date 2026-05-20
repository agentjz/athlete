# Kitty Agent 运行地图

先阅读 `spec/用户审阅/项目规则/用户偏好.md`。

然后 research 当前仓库。任何判断、决策、修改和结论都必须基于当前代码、测试和 spec 事实。

测试只写当前架构的正向事实。不要写旧概念黑名单。

## 真相源

- `spec/用户审阅/项目规则/用户偏好.md`：项目所有者不要什么。
- `spec/用户审阅/系统核心/核心地图.md`：当前核心体验和模块边界。
- `spec/用户审阅/宪法原则/`：长期原则，必须基于当前现状维护。
- `spec/用户审阅/`：用户可审阅的当前产品和架构事实。
- `spec/技术实现/`：当前代码实现事实。
- `src/`：实现。
- `tests/`：当前架构正向事实测试。

## 当前源码地图

- `src/agent/`：Agent 循环、prompt、turn 执行。
- `src/context/`：项目上下文、运行时上下文、长上下文压缩。
- `src/session/`：session、checkpoint、工作记忆、连续性。
- `src/provider/`：模型 provider 调用链、API 适配、请求恢复。
- `src/config/`：配置、环境变量、provider 和 extension 开关。
- `src/tools/`：四个 core 工具和共享工具 runtime。
- `src/extensions/`：可插拔 extension 工具集合。
- `src/host/`：宿主共享运行边界。
- `src/interaction/`、`src/shell/`、`src/telegram/`：交互终端和 Telegram 产品面。
- `src/runtime-ui/`：运行时展示。
- `src/observability/`：事件、终端日志、崩溃记录。
- `src/project/`、`src/types/`、`src/utils/`：项目状态、公开类型和通用工具。

## 验证

除非文件格式明确要求其他编码，否则所有文件都按 UTF-8 阅读和写入。

写文件不是完成。大型改动完成前运行：

```bash
npm.cmd run verify
```

不要 git commit / git push，除非项目所有者明确要求。
