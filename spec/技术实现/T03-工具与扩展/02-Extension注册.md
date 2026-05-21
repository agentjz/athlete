# Extension 注册

Extension 真相源：

- `src/extensions/definitions.ts`

这里集中维护：

- extension id
- 默认开关
- 用户可读说明
- 工具集合工厂
- capability 描述、适用场景和成本等级

当前 id：

- `todo`
- `worktree`
- `network`
- `spec`

当前默认开关：

- `todo`: 开
- `worktree`: 开
- `network`: 开
- `spec`: 关

Registry：

- `src/extensions/registry.ts`
- `src/config/extensions.ts`

`registry.ts` 只根据配置读取 definition 并创建工具集合。`config/extensions.ts` 只根据 definition 生成默认开关和读取启用 id。

共享状态工具：

- `src/extensions/shared.ts`

Extension 工具返回 JSON 时使用共享结果出口；单个扩展可以保留有语义的薄命名函数，但不重复实现 JSON 输出格式。
