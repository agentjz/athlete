# Kitty Pi 风格极简 Agent 重构计划

## 最高原则：激进演进与无兼容

- [x] 向后兼容不是 Kitty 的默认价值。
- [x] 新设计更强时，旧设计必须物理删除。
- [x] 不保留旧 route、旧 prompt、旧 flag、旧 mode、旧测试、旧文档。
- [x] 不保留旧 fallback、旧类型名、旧 wrapper、旧兼容 adapter。
- [x] 不把旧残余重命名后假装成新东西。
- [x] 先物理删除，再重写当前需要的最小实现。

## 已确认方向

- [x] `agent` 模式走 Pi 风格极简编码路径。
- [x] `agent` 模式默认只暴露 `read / edit / write / bash`。
- [x] 搜索、定位、Git 状态、Git diff、构建和测试全部交给 `bash`。
- [x] `spec` 模式保留生态能力。
- [x] 生态是否可用只由明确模式状态决定，不靠关键词、正则或自然语言猜测。
- [x] 旧基础工具组已经物理删除，不做兼容层，不做换皮层。
- [x] 历史审阅快照已经物理删除，生成事实源迁到 `spec/capability-ecology.json`。
- [x] 固定 Live ecology 库存门禁已经撤出普通 verify。

## 四件套协议

- [x] `read`：读局部文本窗口，只收 `path / offset / limit`。
- [x] `edit`：用当前精确文本替换，只做已有文件编辑。
- [x] `write`：新建或完整重写文件。
- [x] `bash`：执行 shell 命令，负责搜索、目录、Git、构建和测试。

## 模型热路径

- [x] 成功输出保持短。
- [x] 失败只给事实和必要恢复位置。
- [x] 机器层保留 raw args、raw result、duration、exit code、artifact、diff、trace。
- [x] 机器层只记录事实，不替模型决定下一步。
- [x] 模型是最终裁判，机器证据是黑匣子。

## 生态关系

- [x] Lead 永远存在。
- [x] 生态永远存在。
- [x] `agent` 模式不默认看到生态工具。
- [x] `spec` 模式可以启用子代理、做梦、网络、文档、后台任务等生态能力。
- [x] 生态执行结果回到 Lead 时默认只给摘要、产物路径、变更结果和状态。

## 验收方式

- [x] 不把固定 Live ecology harness 当主要验收。
- [x] build 后用真实构建产物跑 CLI。
- [x] 用自由提示词和日志观察验证四件套体验。
- [x] 小改任务：`bash` 定位 -> `read` 精读 -> `edit` -> `bash` diff/test。
- [x] 新建任务：`write` -> `bash` diff/test。
- [x] 搜索和 Git 任务只通过 `bash` 完成。

## 完成标准

- [ ] `agent` 模式模型侧只看到 `read / edit / write / bash`。
- [ ] `agent` 模式普通代码任务不默认出现生态能力。
- [ ] `spec` 模式生态能力保留并可明确启用。
- [ ] 旧基础工具代码、测试、文档、生成源、仓库契约全部清理干净。
- [ ] 没有兼容层、换皮层、隐藏旧路径。
- [ ] 真实 CLI 测试证明四件套能稳定完成基础编程任务。
