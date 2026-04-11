# CLI product surface

## 作用

这一层定义 Athlete CLI 的产品入口，不定义控制面真相源本身。

它约束的是：

- 哪些命令必须快启动
- 哪些命令只允许走 lightweight path
- 哪些命令才允许拉起完整 runtime
- 用户看到的错误、帮助、runtime summary 至少要稳定到什么程度

## 启动链分层

CLI 当前必须拆成这几层职责：

1. 入口分发
2. CLI 参数解析
3. lightweight runtime/config 解析
4. 重模块初始化
5. 命令执行

`src/cli.ts` 只允许保留入口分发和顶层失败收口，不继续承担所有命令细节。

## fast path

这些命令必须在不拉起完整 runtime 的前提下完成：

- `athlete --version`
- `athlete version`
- `athlete --help`
- `athlete help`
- `athlete config path`

它们不能因为：

- 缺 API key
- provider 不可达
- 项目没有 `.athlete/.env`
- runtime state 损坏

而失败或混入技术异常。

## lightweight path

这些命令允许解析配置和本地状态，但不允许启动 agent turn 或 channel service loop：

- `athlete init`
- `athlete config show`
- `athlete config get <key>`
- `athlete config set <key> <value>`
- `athlete config path`
- `athlete sessions`
- `athlete changes`
- `athlete undo`
- `athlete diff`
- `athlete doctor`

它们的目标是“立刻给用户答案”，而不是先进入完整 runtime 世界。

## full runtime path

这些命令才允许拉起完整 runtime 或长期服务：

- `athlete`
- `athlete run ...`
- `athlete resume ...`
- `athlete telegram serve`
- `athlete weixin serve`
- `athlete __worker__ background`
- `athlete __worker__ teammate`

## 配置与错误边界

### 配置

- 全局 `config.json` 必须有 `schemaVersion`
- 旧版无版本字段配置只允许一次性升级
- 明确版本不匹配、JSON 损坏、字段非法时必须 fail-closed
- 不为错误旧配置长期保留兼容层

### 错误

CLI 错误至少分三类：

- 用户可修复错误
- 环境 / 网络 / provider 错误
- 内部错误

用户默认必须直接看到：

- 受影响的命令
- 出错对象或路径
- 下一步动作

调试细节可以附带，但不能替代可操作提示。

## doctor 输出要求

`athlete doctor` 至少要稳定告诉用户：

- 配置文件路径
- 当前 model / base URL / mode
- API key 是否缺失
- 是本地配置问题、网络问题、provider 认证问题，还是 provider 服务异常

`doctor` 不是 SDK 异常透传器。

## runtime summary / closeout / visible text

`/runtime`、one-shot closeout 和可见事件输出至少不能丢这些信号：

- 当前在等什么
- 最近一次 runtime transition
- request / tool / recovery / wait / verification 状态
- 最近做了什么
- 哪个环节最慢
- 是否仍在恢复或等待验证

文本可以更产品化，但不能把真实状态磨平。

## Windows 约束

- 源码联调文档优先使用 `npm.cmd`
- CLI 文本写出必须固定编码，不依赖本机代码页碰运气
- 路径提示应直接给出可复制的本地路径
- 入口帮助文案要兼顾 `athlete` 与 `node dist\\cli.js`

## 本轮明确清理的残余

这些思路不再保留在主路径上：

- 顶层 import 提前把 agent / provider / channel / worker 全部拉起
- 轻命令无脑走完整 runtime 初始化
- 旧版无 schema 配置“碰巧还能跑”就继续放过
- 直接向用户吐底层 SDK / 网络异常，不给修复动作
- runtime summary 只剩技术碎片，用户看不出系统在等什么
