# Kitty / Codex 基础工具打磨循环 Plan

## 目标

把 Kitty 的基础工具打磨到接近 Codex 的工程师节奏，但不把 Kitty runtime 退化成裸 shell。

核心判断标准：

- Codex 的优势是快：快速定位、局部读取、直接编辑、diff 对账、命令验证。
- Kitty 的优势是稳：结构化工具、anchors、identity、change record、session trace、Web/CLI 可观察。
- Kitty 要学习的是 Codex 的节奏，不是照搬 Codex 的裸工具形态。

目标工具范围只包括基础工具：

- 定位：`list_files` / `find_files` / `search_files`
- 精读：`read_file`
- 编辑：`write_file` / `patch_file` / `edit_file` / `undo_last_change`
- 对账：`git_status` / `git_diff`
- 验证：`run_shell`

不在本轮范围：

- Web UI
- dreaming
- subagent / teammate
- network / documents
- task / worktree / background ecology
- capability package

## 循环方法

每一轮都按同一个闭环执行：

1. 用 Codex 方式跑同一个小任务。
2. 用 Kitty 方式跑同一个小任务。
3. 对比两边输出。
4. 找出 Kitty 的差距。
5. 只改最小必要代码。
6. 再跑同一轮任务验证。
7. 记录结果和下一轮问题。

原则：

- 不写过度严格的测试文件来约束模型行为。
- 真实 API 日志、session record、tool trace 是主证据。
- 报告文件可以有，但不是通过门槛。
- 能恢复的工具调用失败不算最终失败，但必须保留在日志里。
- 不追求模型每次输出固定格式，重点看工具是否顺手、低噪、可恢复。
- 不把 runtime 变成一堆测试门槛；测试 harness 只负责观察。

## 记录模板

每轮按这个格式记录：

```md
## Round N - <主题>

### 提示词

Codex 侧提示词：

Kitty 侧提示词：

### Codex 结果

- 使用了哪些基础工具：
- 输出速度感：
- 噪音：
- 失败/恢复：
- 结论：

### Kitty 结果

- 使用了哪些基础工具：
- 输出速度感：
- 噪音：
- 失败/恢复：
- session/tool trace 证据：
- 结论：

### 差距

- 

### 修改

- 

### 复测

- Codex 复测：
- Kitty 复测：
- 是否收敛：

### 下一轮

- 
```

## Round 1 - 基础读写改闭环

### 本轮目的

验证 Kitty 是否已经学到 Codex 的基础工程师节奏：

`定位事实 -> 精读 -> 编辑 -> diff 对账 -> 命令验证`

同时观察：

- `read_file` 是否比裸 `Get-Content` 噪音过大。
- `patch_file` 是否真的提供 Codex 式快改能力。
- `edit_file` 的 stale anchor 失败是否短、准、可恢复。
- `git_status` / `git_diff` 是否比裸 `git status` / `git diff` 更适合 runtime。
- `run_shell` 是否容易诱导模型写出不兼容 shell 语法。

### Codex 侧提示词

```text
只用工程师式基础工具完成一个最小闭环：

1. 快速定位 package.json 和 README.md。
2. 只读取 package.json 前 24 行。
3. 搜索 package.json / README.md 里的 kitty/name 相关事实。
4. 查看当前 git diff 统计。
5. 查看 node --version。

不要改代码。
最后用简短中文总结：用了哪些工具、速度感如何、输出里有哪些噪音。
```

建议 Codex 命令：

```powershell
rg --files -g package.json -g README.md
rg -n '"name"|Kitty|kitty' package.json README.md
Get-Content -Encoding UTF8 -TotalCount 24 package.json
git diff --stat
node --version
```

### Kitty 侧提示词

```text
只测试 Kitty 基础工具，不测试生态能力。

请完成一个最小基础工具闭环：

1. 用 list_files / find_files / search_files 定位 package.json 和 README.md。
2. 用 read_file 读取 package.json 和 README.md 的小片段，不要整文件乱读。
3. 用 git_status / git_diff 查看当前工作区事实。
4. 用 run_shell 运行 node --version 和 git status --short。
5. 不修改项目源码。

请直接执行工具，不需要写固定格式报告。
最后用中文简短总结：每个工具是否顺手、哪里有噪音、哪里有失败但已恢复。
```

建议运行：

```powershell
npm.cmd run live:ecology -- --group foundation-tools --timeout-ms 180000
```

### 编辑工具 Kitty 侧补充提示词

```text
只测试 Kitty 编辑基础工具。

在允许的测试目录里完成：

1. write_file 创建 utf8-sample.txt，内容是 alpha / beta / gamma。
2. read_file 读取样本文件。
3. patch_file 把 beta 改成 BETA。
4. fresh read_file。
5. edit_file 把 gamma 改成 GAMMA。
6. undo_last_change 只撤销 edit_file 这一步。
7. read_file 确认最终内容是 alpha / BETA / gamma。

不需要写固定格式报告。
最后用中文简短总结工具是否顺手、失败是否可恢复。
```

建议运行：

```powershell
npm.cmd run live:ecology -- --group patch-edit-tools --timeout-ms 240000
```

### 已观察到的 Codex 结果

- 工具路径非常短：`rg -> Get-Content -> git diff -> node --version`。
- 速度感强，几乎没有协议包装。
- 噪音也明显：`git diff --stat` 会把整个脏工作区和 CRLF warning 一起吐出来。
- Codex 更适合强模型直接工程操作，但证据结构弱。

### 已观察到的 Kitty 结果

- `foundation-tools` 能覆盖：
  `list_files / find_files / search_files / read_file / git_status / git_diff / run_shell`
- `patch-edit-tools` 能覆盖：
  `write_file / patch_file / edit_file / undo_last_change`
- `patch_file` 已经补上 Codex 式快速编辑能力。
- `edit_file` 的 stale anchor 失败能提示 fresh `read_file`，模型能恢复。
- `git_status` 大结果会 externalize，结构化但仍可能显得重。
- `run_shell` 仍可能诱导模型写错 PowerShell heredoc，这需要继续观察和提示层打磨。

### Round 1 暴露的问题

1. 测试 harness 不应该把报告文件当通过门槛。
   - 已改为：报告只记录，不作为 pass/fail 条件。

2. live harness 对成功结果识别太窄。
   - 旧逻辑只认 `{ ok: true }`。
   - 实际 Kitty 工具很多成功结果是结构化对象，不带 `ok: true`。
   - 已改为：可解析且不是 `ok: false` 就视为成功结果。

3. `run_shell` 容易出现 shell 方言错误。
   - 例如模型写 Unix heredoc 到 PowerShell。
   - 这不是工具核心失败，但说明提示和 shell 环境展示还可以继续打磨。

4. `git_status` / `git_diff` 的结构化证据强，但大工作区时仍可能重。
   - 后续可观察是否需要更紧凑的默认摘要。

### Round 1 已改动

- 放松 live ecology 报告要求：
  - 报告存在就记录。
  - 报告缺失只显示日志，不导致失败。

- 修正恢复失败识别：
  - 同一个工具后续成功后，不再因为早先失败把整组打成失败。
  - 成功判断从 `ok === true` 改成 `parsed && parsed.ok !== false`。

- patch-edit 提示去掉“必须写报告”的硬限制。

### Round 1 验证命令

```powershell
npm.cmd run typecheck
npm.cmd run live:ecology:dry-run -- --group foundation-tools --group patch-edit-tools
npx.cmd tsx tests\production-line\live-ecology-session.test.ts
npm.cmd run live:ecology -- --group patch-edit-tools --timeout-ms 240000
```

已观察结果：

- `typecheck` 通过。
- dry-run 两个基础组通过。
- session 测试通过。
- `patch-edit-tools` 真实 API 通过。
- 最近一轮 `patch-edit-tools` 没写报告，但仍通过；日志保留 `missing report`，符合当前原则。

### Round 1 当前判断

Kitty 已经学到 Codex 的正确部分：

- 节奏对了。
- `patch_file` 快通道对了。
- `edit_file` 稳通道保留对了。
- `git_status` / `git_diff` 正式对账对了。
- live API 单点压测方式对了。

仍需继续打磨：

- `run_shell` 的 shell 方言提示。
- `git_status` / `git_diff` 默认摘要是否还能更低噪。
- `read_file` 输出在模型侧是否足够轻。
- 模型是否还会跳过 fresh read 后直接 edit。

## 下一轮建议

Round 2 专注 `run_shell`：

- 同一个任务分别用 Codex shell 和 Kitty `run_shell` 跑。
- 观察 PowerShell / cmd / node / python 命令哪个最容易被模型误写。
- 不急着限制模型，只看日志。
- 如果反复错，再决定是否在 `run_shell` 结果或 prompt 中显式展示当前 shell 方言和推荐命令形态。
