---
schema_version: skill.v1
name: browser-automation
description: Drive real browser interaction through Playwright MCP for navigation, forms, clicks, snapshots, and screenshots.
version: 1.0.0
load_mode: required
agent_kinds: lead, teammate
roles: implementer, reviewer, writer
task_types: implementation, validation, research
scenes: browser, webpage, website, login, form, click, input, screenshot, 网页, 网站, 浏览器, 登录, 表单, 点击, 输入, 截图
required_tools: mcp_playwright_browser_navigate, mcp_playwright_browser_snapshot
optional_tools: mcp_playwright_browser_click, mcp_playwright_browser_type, mcp_playwright_browser_take_screenshot, download_url, http_probe
trigger_keywords: browser, navigate, click, type, fill, form, login, screenshot, open page, open website, 打开网页, 打开网站, 浏览器, 登录, 表单, 点击, 输入, 截图
trigger_patterns: ["https?://","(open|visit|navigate).*(page|website|webpage)","(click|type|fill|login)","(打开|访问).*(网页|网站)","(点击|输入|登录|截图)"]
---
# Browser Automation

Use this workflow when the task requires real browser interaction instead of plain text retrieval.

1. Navigate first, then inspect the page with `browser_snapshot` before clicking or typing so you act on the current visible structure.
2. Prefer MCP browser actions such as click, type, and screenshot over shell commands or local-file guesses.
3. Use screenshots when the user wants visual proof or when a validation artifact will help confirm what happened in the page.
4. For form or login flows, advance in small steps: navigate, snapshot, click or type, snapshot again if the page changes.
5. If the page exposes a file download URL that must enter a local document toolchain, use `download_url` instead of detouring into ad-hoc shell fetches.
6. If the page cannot be driven through MCP, explain the failure and only then consider a non-browser fallback.
