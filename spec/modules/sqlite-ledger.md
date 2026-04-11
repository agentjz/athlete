# sqlite ledger

## 作用

`sqlite-ledger` 是 Athlete 控制面的正式本地账本模块。

它负责把原先散落在多个 JSON 文件里的正式状态，收口到一个 SQLite 文件里。

## 文件位置

- 账本：`.athlete/control-plane.sqlite`
- 审计消息：`.athlete/team/messages.jsonl`
- inbox 审计：`.athlete/team/inbox/*.jsonl`
- worktree 事件：`.athlete/worktrees/events.jsonl`

## 表结构

### ledger_meta

用途：

- 记录 schema version
- 记录账本初始化元数据

### tasks

用途：

- 任务主体
- owner / assignee / checklist / description / worktree 绑定

### task_dependencies

用途：

- 记录 blocker -> blocked 关系
- 支持依赖图和冲突裁决

### team_config

用途：

- 记录当前 teamName

### team_members

用途：

- 记录 teammate 角色、状态、pid、sessionId

### coordination_policy

用途：

- 记录是否允许 plan decision / shutdown request

### protocol_requests

用途：

- 记录正式协作请求与决策结果

### background_jobs

用途：

- 记录后台命令状态机

### worktrees

用途：

- 记录 worktree 名称、路径、分支、状态

## 裁决规则

### 任务 claim

- 必须通过账本层条件更新完成
- 同一任务同一时刻只能有一个成功 claim 结果

### worktree 绑定

- 绑定关系由账本中的正式字段裁决
- reload 后必须仍能恢复同一绑定

### 协议请求

- `pending -> approved / rejected` 只能走正式状态机
- 不能靠消息内容猜测审批结果

### background job

- `running / completed / failed / timed_out` 必须持久化
- reconcile 只能写账本，不写旧 JSON

## 旧路径清理边界

会被直接停用或清理的旧真相源：

- `.athlete/tasks/`
- `.athlete/team/config.json`
- `.athlete/team/policy.json`
- `.athlete/team/requests/`
- `.athlete/team/background/`
- `.athlete/worktrees/index.json`

不会被清理的审计路径：

- `.athlete/team/messages.jsonl`
- `.athlete/team/inbox/`
- `.athlete/worktrees/events.jsonl`

## 非目标

这轮不做：

- 旧 JSON 到 SQLite 的长期迁移兼容
- 新旧双写
- 让 JSON 回到机器裁决链路
- 把 session / checkpoint / runtime stats 也一起重做
