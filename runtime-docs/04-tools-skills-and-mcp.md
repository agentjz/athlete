# How Tools, Skills, And MCP Are Used

## One Sentence

Tools perform actions, skills provide workflows, and MCP adds external capabilities. Lead chooses when to use them.

## Runtime Story

If a task needs file inspection, Lead should use file tools. If a workflow-specific skill applies, Lead loads it first. If browser or document MCP tools are available and relevant, Lead should prefer them over generic shell detours.

The machine layer exposes capabilities and records tool results. It does not pretend that a tool succeeded without evidence.
