---
schema_version: skill.v1
name: test-guardrails
description: Keep implementation changes anchored to failing tests, narrow fixes, and green verification.
version: 1.0.0
load_mode: suggested
agent_kinds: lead, teammate
roles: implementer, reviewer, writer
task_types: implementation, validation, testing
scenes: test, regression, fail-first
required_tools: todo_write
optional_tools: read_file, search_files, run_shell
trigger_keywords: test, tests, regression, fail-first
---
# Test Guardrails

Use this workflow when the task depends on tests staying trustworthy.

1. Identify the exact behavior to protect before editing code.
2. Prefer adding or tightening the smallest failing test that proves the gap.
3. Make the narrowest code change that turns that test green.
4. Run only the most relevant verification first, then expand if risk remains.
5. Summarize the regression you protected so the next turn can continue safely.
