# config system

## 作用

配置系统负责统一读取 Athlete 的运行参数，并把项目级默认值、用户配置和环境变量合并成最终 runtime config。

## 当前范围

- provider / API key / base URL / model
- mode
- paths
- config schema version
- MCP 总开关与 server 配置
- Playwright MCP repo 级默认值
- context / continuation / read limits 等运行阈值

## 当前规则

1. 配置入口统一。
2. 业务模块不直接散读环境变量。
3. 用户能从 runtime config 理解当前行为从哪来。
4. 项目级默认值允许放在 `.athlete/.env`，但仍由统一配置入口解析。
5. 全局配置文件必须带 schema version，错误配置按 fail-closed 处理。

## schema version

全局配置文件位于应用配置目录下的 `config.json`，当前 schema 为 `1`。

### 允许的输入

- 文件不存在：返回默认配置
- `schemaVersion = 1`：按当前 schema 正常解析
- 旧版无 `schemaVersion` 的历史配置：允许一次性升级为 `schemaVersion = 1`，随后写回正式格式

### 不允许的输入

- JSON 不可解析
- `schemaVersion` 不是数字
- `schemaVersion` 明确不是当前支持版本

这些情况都必须直接报错，不做长期双轨兼容，不默默忽略，也不让系统“碰巧还能跑”。

## 修复策略

当配置损坏或版本不匹配时，CLI 必须直接告诉用户：

- 当前配置文件路径
- 是 schema version 问题还是 JSON/字段问题
- 应该删除重建、手工修复，还是重新执行 `athlete config set`

`athlete config path` 必须始终可用，这样即使配置本身坏掉，用户也能立刻定位修复入口。

## provider 当前事实

当前统一入口会解析：

- `ATHLETE_PROVIDER`
- `ATHLETE_API_KEY`
- `ATHLETE_BASE_URL`
- `ATHLETE_MODEL`

代码默认值与模板示例仍以 DeepSeek 系列为起点，但这只是默认配置/示例，不是 runtime kernel 绑定。
项目本地 `.athlete/.env` 可以把有效 provider / base URL / model 覆盖到别的 OpenAI-compatible 服务。

## Playwright MCP 当前事实

当前支持的 repo 级 Playwright MCP 环境变量：

- `ATHLETE_MCP_ENABLED`
- `ATHLETE_MCP_PLAYWRIGHT_ENABLED`
- `ATHLETE_MCP_PLAYWRIGHT_BROWSER`
- `ATHLETE_MCP_PLAYWRIGHT_HEADLESS`
- `ATHLETE_MCP_PLAYWRIGHT_OUTPUT_MODE`
- `ATHLETE_MCP_PLAYWRIGHT_SAVE_SESSION`

当前代码默认值：

- 代码默认值是关闭
- 默认浏览器为 `chromium`
- 默认不是 headless
- 默认 output mode 为 `stdout`
- 默认 save session 为开启

当前项目模板行为：

- `src/config/init.ts` 生成的 `.athlete/.env` / `.athlete/.env.example` 会给出一组 repo 级 Playwright MCP 示例开关
- 项目本地真实 `.athlete/.env` 可以进一步覆盖这些有效值

## 路径约定

当前 Playwright MCP 状态目录：

- `.athlete/playwright-mcp/config.json`
- `.athlete/playwright-mcp/profile/`
- `.athlete/playwright-mcp/output/`
- `.athlete/playwright-mcp/legacy-root-artifacts/`

这些路径由配置系统和 `src/mcp/playwright/` 统一导出，不允许在调用侧随意拼接。

## 当前代码落点

- `src/config/store.ts`
  - runtime config 合并入口
  - config schema version 校验 / 一次性升级 / fail-closed 报错
- `src/config/init.ts`
  - `.athlete/.env` / `.athlete/.env.example` 模板
- `src/agent/provider.ts`
  - provider capability profile 消费 config 中的 provider/model
