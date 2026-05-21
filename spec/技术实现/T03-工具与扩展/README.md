# 工具与扩展

工具层由 `src/tools/` 和 `src/extensions/` 组成。

`src/tools/` 管 core 工具和工具 runtime。

`src/extensions/` 管 extension 工具集合。

`src/protocol/` 管 extension 能力协议、package、port、governance 和收敛检查。

`src/host/toolRegistry.ts` 负责把 core 工具面和 extension 工具集合装配成当前入口真实暴露给模型的工具面。

`kitty spec` 使用 `src/spec/runtime.ts` 选择阶段工具面：spec 建立和确认阶段只给 `read`、`bash` 与 spec 工具；实现和验证阶段才给完整 core 工具。
