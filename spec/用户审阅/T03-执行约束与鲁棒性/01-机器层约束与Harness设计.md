# 机器层约束与 Harness 设计

## 一句话

机器层是身体，模型是脑。

机器层负责记录、执行、约束和唤醒；模型负责判断、选择、验证和收口。

## 现在的运行方式

Lead 看到目标后自己决定怎么做。机器层只把可用工具、skill、队友、子代理、后台执行和账本事实摆出来。

如果工具参数非法、文件版本过期、执行超时、同一个无进展调用完全重复，机器层可以阻断，因为这些是死约束。

如果只是“可能需要验证”“acceptance 还 pending”“有 skill 可能相关”“刚才改了文件”“shell 不是只读”，机器层不能把这些变成继续命令。它只能记录事实，让 Lead 判断。

## 允许机器做的事

- 暴露能力
- 执行 Lead 显式发出的工具调用
- 保存 checkpoint、artifact、verification、acceptance、todo 等账本
- 阻止非法工具参数、过期编辑、无边界执行、重复无进展调用
- 在后台、队友、子代理结果变化时唤醒 Lead

## 不允许机器做的事

- 自动要求验证、修复或重新验证
- 自动要求 change route、choose next action、不要 explanation-only
- 自动因为 skill 缺失、索引命中或元数据匹配推动加载
- 自动从 checkpoint 推导下一步
- 把 internal reminder 当成用户消息
- 把旧账本默认塞进当前 prompt
- 在工具失败或 blocked 结果里写 `next_step`

## 验收口径

Deadmouse 要求交付有证据，但证据是否足够由模型判断。

机器层只保证证据和状态可查、可追溯、不会伪造成通过。

这条边界比旧的 verification gate 更强：它保留真实运行约束，同时删除机器层伪装成策略大脑的路径。
