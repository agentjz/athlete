# ToolRegistry

## 作用

ToolRegistry 负责统一管理模型可见工具。

## 最小职责

- 返回工具定义
- 按名称执行工具
- 根据 mode / runtime 过滤工具集

## 不负责

- provider 请求
- session 存储
- 任务真相维护

## 关键要求

无论未来 tools、skills、MCP 怎么扩，模型看到的动作入口都要保持统一。
