---
schema_version: skill.v1
name: web-research
description: Research public web information with browser MCP tools, then summarize findings into the requested artifact.
version: 1.0.0
load_mode: required
agent_kinds: lead, teammate
roles: implementer, reviewer, writer
task_types: research, documentation, validation
scenes: web, webpage, website, browser, online, 网页, 网站, 浏览器, 上网, 网上
required_tools: mcp_playwright_browser_navigate, mcp_playwright_browser_snapshot
optional_tools: mcp_playwright_browser_take_screenshot, write_file, read_file
trigger_keywords: web, webpage, website, online, browser, browse, latest news, latest updates, public info, open the page, open the website, 上网, 网上, 网页, 网站, 浏览器, 打开网页, 打开网站, 查一下, 查最新, 最新消息, 最新公开消息
trigger_patterns: ["https?://","(search|look up|find).*(web|website|webpage|online)","(打开|查看).*(网页|网站)","在网上查","网页上找"]
---
# Web Research

Use this workflow when the user wants information from the public web and expects a summary, notes, or a written deliverable.

1. If Playwright browser MCP tools are available, use them before `list_files`, `read_file`, or `run_shell` for webpage navigation and reading.
2. Start by navigating to the relevant page, then use `browser_snapshot` to inspect the page structure and text before deciding the next action.
3. Open additional pages only when the first page is insufficient, when a fact needs confirmation, or when the user asked for multiple sources.
4. Keep extracted facts short and attributable. Do not invent a source that you did not actually open.
5. Use shell-based fetching only as an explicit fallback after browser MCP is unavailable or fails, and say that it was a fallback.
6. When the user asks for a document or notes file, write the summary to the requested path before finishing.
