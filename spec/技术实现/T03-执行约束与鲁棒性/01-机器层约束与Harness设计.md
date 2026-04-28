# 机器层约束与 Harness 设计

## 当前真相

Deadmouse 的机器层是运行身体，不是第二个大脑。

模型负责活判断：理解目标、选路线、决定是否用工具、是否加载 skill、是否委派、是否验证、验证是否足够、验收是否满足、是否继续或收口。

机器层负责死逻辑：暴露能力、执行显式动作、记录状态、保存证据、维护账本、执行硬边界、阻止非法状态、在事实变化时唤醒 Lead。

能力可见不是意图。账本事实不是策略。checkpoint、verification、acceptance、todo、skill、worktree、inbox、runtime state 都不能被机器层转换成“下一步该做什么”。

## 正式边界

机器层可以做：

- 工具 schema、参数和权限形态校验
- 文件 identity、anchor、stale edit、覆盖写入等确定性约束
- pending tool calls、tool batch 顺序、结果归档
- execution/process runtime、idle、timeout、terminate 边界
- session snapshot、checkpoint、runtime stats、artifact 引用持久化
- verification/acceptance/todo/skill 状态的事实记录
- loop guard 对完全重复且无新事实的工具调用做硬阻断
- 空 assistant 结果的最低限度 runtime recovery

机器层不能做：

- 自动要求验证、修复、重新验证或继续
- 因 changedPaths、shell 是否只读、工具 mutation metadata 自动判定需要验证
- 因 acceptance pending/failed 自动要求 change route 或选择下一步
- 因 skill 缺失、索引命中或元数据匹配自动推进加载
- 从 checkpoint、tool batch、artifact preview 推导 next step
- 把 internal reminder 伪装成 user message
- 把 ledger 默认注入当前注意力
- 把 todo/plan gate 扩张成策略引擎
- 在 blocked/tool failure 结果里生成 `next_step`

## 关键状态

### verification

verification 只记录事实：

- 是否出现过验证尝试
- 验证命令或工具类型
- exit code / pass / fail
- 观察到的路径或 artifact
- 更新时间

它不产生 required、reminder、awaiting_user、fix、re-verify 或 closeout gate。

### acceptance

acceptance contract 可以被解析和检查，但检查结果只是事实摘要。

pending/failed/completed 不能变成 route-change 指令，不能要求模型“不要 explanation-only”，不能替 Lead 选择下一步。

### skill

skill 是能力 surface。机器层可以暴露 skill 名称、描述、触发信息和加载状态。

缺失 skill 不是阻断，不是 continuation reason，也不是自动加载命令。是否加载由模型判断。

### checkpoint

checkpoint 保存运行状态：

- flow/runState
- pendingToolCalls
- recentToolBatch
- artifact 引用
- completedSteps 事实

checkpoint 不保存也不生成 `currentStep` / `nextStep` 策略句。

### dynamic prompt

当前目标优先。旧账本默认归档，只在当前目标需要的事实边界里暴露。

prompt 可以给 Lead 看事实和能力，不能把 verification focus、acceptance gate、coordination state、task board、worktree 状态写成当前行动压力。

## 保留的硬约束

- 非法工具参数 fail closed
- stale edit fail closed
- 覆盖已有文件必须走正式编辑/写入 guard
- 执行通道必须有 runtime/idle boundary
- pending tool calls 必须按协议收口
- 完全重复且无新事实的工具调用可以被 loop guard 阻断
- 空 assistant 可见结果不能伪装成成功
- 背景、队友、子代理 execution 到边界后只写事实并唤醒 Lead

这些约束阻止非法状态，不替模型决定活路。

## 测试保护

测试必须保护以下合同：

- verification/acceptance/todo/skill 不阻断可见 closeout
- verification 不因 shell/read-only/changedPaths 自动 required
- acceptance 不生成 route-change 文案
- missing skill 不触发 continuation
- checkpoint 不生成 strategy next step
- blocked/tool failure/shutdown pending 不返回 `next_step`
- internal reminder 不进入 user goal/task/strategy 路径
- dynamic prompt 默认只暴露当前目标相关事实
- loop guard 文案只说明阻断事实，不要求换策略
