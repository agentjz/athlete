# Extension 集合

当前 extension 集合：

- `todo`
- `worktree`
- `network`
- `spec`

扩展开关由配置集中控制。扩展开启后进入同一个 agent 工具面；关闭后不进入工具面。

extension 是工具集合，不是运行模式。

`todo` 是会话级 todo 写入和展示，不拆成独立读写任务板。

`network` 是一组网络工作工具：HTTP session、请求、探测、下载、trace 和 OpenAPI 检查放在同一个扩展集合里。
