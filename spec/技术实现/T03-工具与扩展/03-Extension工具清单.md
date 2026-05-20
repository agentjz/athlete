# Extension 工具清单

## todo

- `todo_write`：写入当前会话 todo 列表，结果进入 session 和 working memory，并显示 checklist preview。

## worktree

- `worktree_create`：创建 git worktree，并记录 lifecycle state。
- `worktree_events`：读取最近 worktree lifecycle 事件。
- `worktree_get`：读取一个 worktree 事实。
- `worktree_keep`：标记或取消保留 worktree 路径。
- `worktree_list`：列出当前仓库 worktree。
- `worktree_remove`：删除 git worktree，并记录 lifecycle state。

## network

- `download_url`：只下载 HTTP(S) URL 到本地文件，并上报 changed path。
- `http_probe`：探测一个 HTTP endpoint 的状态、耗时和响应头。
- `http_request`：执行单个 HTTP 请求，支持 session 默认值和断言。
- `http_session`：集中管理 HTTP base URL、headers、query、cookies 和 token。
- `http_suite`：按顺序执行 HTTP 请求步骤和断言。
- `network_trace`：写入结构化网络证据 JSON，request 必须包含 method 和 url。
- `openapi_inspect`：读取 OpenAPI JSON 并列出 operations。
- `openapi_lint`：检查 OpenAPI JSON 的核心结构事实。

## spec

- `spec_list`
- `spec_search`
- `spec_create`
- `spec_open`
- `spec_update_state`
- `spec_append_note`
- `spec_write_document`
- `spec_read_document`
- `spec_checkpoint_create`
- `spec_checkpoint_list`
- `spec_checkpoint_restore`
- `spec_task_update`
