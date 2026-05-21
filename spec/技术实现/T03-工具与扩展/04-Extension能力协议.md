# Extension 能力协议

当前 extension 不直接变成新的运行核心。

Extension 先注册工具集合，再通过 capability package 暴露能力边界。

实现落点：

- `src/extensions/definitions.ts`：extension id、默认开关、说明、工具集合工厂和 capability 元数据的集中真相源。
- `src/extensions/registry.ts`：根据配置创建 extension 工具集合。
- `src/extensions/capabilities.ts`：读取 definition，把 enabled extension 转成正式 capability package。
- `src/protocol/`：capability、package、port、governance、diagnosis、manifest 协议。
- `tests/protocol/extension-capabilities.test.ts`：验证 extension capability package 和真实工具收敛。

协议事实：

- capability package 不允许机器自动选择策略。
- capability package 不允许自动派发。
- extension tool 只能执行声明的机器操作。
- lead agent 决定是否调用工具、何时调用工具、如何解释结果。
- 声明的 tools 必须和真实暴露的工具收敛。
- capability 描述、适用场景和成本等级不在 adapter 里分散维护。
