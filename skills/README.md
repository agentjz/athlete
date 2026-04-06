# Skills

当前 skill 命名规范：

- 用稳定的 `kebab-case`
- 优先 2 个词，必要时 3 个词
- 名字像“能力 ID”，不是自然语言句子
- 缩写只保留通用领域词，例如 `pdf`
- 详细解释放在 `description` 和正文标题里，不塞进 `name`

当前保留的官方 skill：

- `test-guardrails`
  作用：测试优先、回归保护、缩小改动范围
- `spec-alignment`
  作用：实现与 SPEC / docs 对齐
- `pdf-reading`
  作用：PDF 走 `read_pdf` / MinerU 提取链路

下一阶段推荐的联网相关 skill：

- `web-research`
  作用：公开网页检索、抓取、阅读、总结
- `browser-automation`
  作用：真实浏览器交互、登录态页面、表单与点击流程
