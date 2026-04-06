# RuntimeLoop

## 作用

RuntimeLoop 负责驱动一个 turn，直到：

- 完成
- 暂停
- yield
- 报错

## 最小职责

- 组装请求上下文
- 读运行时状态
- 调模型
- 执行工具
- 处理 continuation / compact / verification

## 不负责

- 保存长期任务真相
- 发明新工具
- 实现具体业务流程

## 下一阶段要求

总指挥层可以成为 loop 的上游决策来源，但不能把 RuntimeLoop 变成一个巨大的业务文件。
