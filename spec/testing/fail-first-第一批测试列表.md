# fail-first 第一批测试列表

## 先补的测试

1. 总指挥层不会破坏现有 continuation
2. 总指挥层不会绕过 task board 真相源
3. lead 能在 subagent / teammate / background 之间做正确分流
4. skills 元数据缺失时有明确失败结果
5. skill 加载后能被后续 turn 正确识别
6. reviewer / verifier 角色不会越权修改任务分配
7. 单文件拆分后 registry 与 runtime 行为不变
