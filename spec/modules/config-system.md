# config system

## 作用

配置系统负责统一读取 Athlete 的运行参数，并把项目级默认值、用户配置和环境变量合并成最终 runtime config。

## 当前范围

- API key / base URL / model
- mode
- paths
- MCP 总开关与 server 配置
- Playwright MCP repo 级默认值
- context / continuation / read limits 等运行阈值

## 当前规则

1. 配置入口统一。
2. 业务模块不直接散读环境变量。
3. 用户能从 runtime config 理解当前行为从哪来。
4. 项目级默认值允许放在 `.athlete/.env`，但仍由统一配置入口解析。

## Playwright MCP 当前事实

当前支持的 repo 级 Playwright MCP 环境变量：

- `ATHLETE_MCP_ENABLED`
- `ATHLETE_MCP_PLAYWRIGHT_ENABLED`
- `ATHLETE_MCP_PLAYWRIGHT_BROWSER`
- `ATHLETE_MCP_PLAYWRIGHT_HEADLESS`
- `ATHLETE_MCP_PLAYWRIGHT_OUTPUT_MODE`
- `ATHLETE_MCP_PLAYWRIGHT_SAVE_SESSION`

当前仓库默认行为：

- Playwright MCP 在项目级 `.athlete/.env` 中默认启用
- 默认浏览器为 `chrome`
- 默认不是 headless
- 默认 output mode 为 `file`
- 默认 save session 为开启

## 路径约定

当前 Playwright MCP 状态目录：

- `.athlete/playwright-mcp/config.json`
- `.athlete/playwright-mcp/profile/`
- `.athlete/playwright-mcp/output/`
- `.athlete/playwright-mcp/legacy-root-artifacts/`

这些路径由配置系统和 `src/mcp/playwright/` 统一导出，不允许在调用侧随意拼接。
