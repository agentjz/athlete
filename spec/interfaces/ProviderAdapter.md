# ProviderAdapter

## 作用

ProviderAdapter 把 Athlete 的请求发送到具体模型服务，并返回统一结果。

## 最小职责

- 接收消息数组
- 接收模型名
- 接收工具定义
- 返回 assistant 文本、reasoning、tool calls
- 对常见 provider 错误提供可恢复语义

## 不负责

- 任务拆分
- 控制面状态判断
- 工具执行

## 稳定边界

只要 adapter 还能提供统一输出，底层 provider 可以继续替换。
