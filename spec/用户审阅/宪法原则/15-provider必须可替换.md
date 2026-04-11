# P15 provider 必须可替换

## 原则

模型提供方必须可替换，Athlete 不能被单一厂商接口锁死。

## 为什么

模型会变、价格会变、稳定性会变。

Athlete 要做 harness，不做某一家的皮肤。

## 在 Athlete 里的含义

- 当前优先支持 OpenAI-compatible 接口
- provider 选择属于配置层，不属于业务层
- provider-specific fallback、reasoning、tool 兼容性都属于 adapter / capability 层，不属于 kernel 主循环

## 当前对应

- `src/agent/provider.ts`
- `src/agent/api.ts`
- `src/config/store.ts`
- `src/types.ts`
