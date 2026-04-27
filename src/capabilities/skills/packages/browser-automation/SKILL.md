---
schema_version: skill.v1
name: browser-automation
description: Drive real browser interaction for dynamic pages, forms, and visual evidence after lightweight web probing is insufficient.
version: 1.1.0
load_mode: required
agent_kinds: lead, teammate
roles: implementer, reviewer, writer
task_types: implementation, validation, research
scenes: browser, webpage, website, login, form, click, input, screenshot
required_tools:
optional_tools: mcp_playwright_browser_navigate, mcp_playwright_browser_snapshot, mcp_playwright_browser_click, mcp_playwright_browser_type, mcp_playwright_browser_take_screenshot, download_url, http_probe, http_request
trigger_keywords: browser, navigate, click, type, fill, form, login, screenshot, open page, open website
trigger_patterns: ["https?://","(open|visit|navigate).*(page|website|webpage)","(click|type|fill|login)"]
---
# Browser Automation

Use this workflow when the task requires real browser interaction rather than plain HTTP text retrieval.

1. Treat browser automation as an escalation stage: first confirm lightweight HTTP probing is insufficient for the task objective.
2. Navigate first, then inspect with `browser_snapshot` before click/type actions so each action targets the current page structure.
3. For forms or login flows, advance in small steps: navigate, snapshot, click/type, snapshot again after each state-changing action.
4. Use screenshots when the user needs visual proof or when a validation artifact should capture UI state.
5. Prefer browser interaction over shell-based web fetching for dynamic pages; shell fallback is last resort and must be explicitly justified.
6. If the page exposes a direct file URL needed for local processing, use `download_url` to hand off into document or local toolchains.
