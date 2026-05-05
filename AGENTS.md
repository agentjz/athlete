# Kitty Agent 运行地图

先阅读 `docs/user-preferences.md`。

然后仔细 research 当前仓库。任何判断、决策、修改和结论都必须基于当前代码事实。如果不是基于事实说话，我们的工作将失去任何意义。

测试只写当前架构的正向事实。不要写“为了防止回退到旧设计”的负向测试，不要用旧概念黑名单当测试。

## 用户偏好

做任何事前，先读 `docs/user-preferences.md`。

这个文件只记录项目所有者不要什么。不要把用户偏好写成教程、计划、流程或技术说明书。

## 仓库地图

- `docs/user-preferences.md`：项目所有者不要什么。
- `docs/core.md`：六大核心模块和边界。
- `src/agent/`：Agent 循环、prompt、turn 执行。
- `src/context/`：项目上下文、运行时上下文、长上下文压缩。
- `src/extensions/`：`super` 模式扩展协议和当前 Socratic workflow。
- `src/session/`：session、checkpoint、工作记忆、连续性。
- `src/provider/`：模型 provider 调用链、API 适配、请求恢复。
- `src/config/`：配置、环境变量、provider 设置。
- `src/tools/`：四个基础工具和共享工具 runtime。
- `src/host/`：CLI、Web、Telegram 共用运行边界。
- `src/runtime-ui/`：运行时展示。
- `src/observability/`：事件、终端日志、崩溃记录。
- `src/shell/`、`src/web/`、`src/telegram/`：具体产品入口。
- `tests/core/`：核心行为测试。
- `tests/production-line/`：仓库结构契约。

## 验证

除非文件格式明确要求其他编码，否则所有文件都按 UTF-8 阅读和写入。

写文件不是完成。大型改动完成前运行：

```bash
npm.cmd run verify
```

不要 git commit / git push，除非项目所有者明确要求。
