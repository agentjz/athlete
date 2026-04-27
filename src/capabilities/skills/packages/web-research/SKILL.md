---
schema_version: skill.v1
name: web-research
description: Research public web information with a layered workflow: lightweight network tools first, browser interaction when needed.
version: 1.1.0
load_mode: required
agent_kinds: lead, teammate
roles: implementer, reviewer, writer
task_types: research, documentation, validation
scenes: web, webpage, website, browser, online
required_tools:
optional_tools: http_probe, http_request, http_session, http_suite, openapi_inspect, openapi_lint, download_url, mcp_playwright_browser_navigate, mcp_playwright_browser_snapshot, mcp_playwright_browser_take_screenshot, write_file, read_file
trigger_keywords: web, webpage, website, online, browser, browse, latest news, latest updates, public info, open the page, open the website
trigger_patterns: ["https?://","(search|look up|find).*(web|website|webpage|online)","(open|visit).*(web|website|page)"]
---
# Web Research

Use this workflow when the user wants information from the public web and expects a summary, notes, or a written deliverable.

1. Start with lightweight network tools (`http_probe`, `http_request`, `openapi_*`) for API endpoints, static pages, and quick reachability checks.
2. Escalate to browser capability tools (`browser_navigate`, `browser_snapshot`, and optional interaction steps) when page rendering, dynamic content, or interaction is required.
3. Open additional sources only when the first source is insufficient, a fact needs cross-checking, or the user explicitly requests multi-source evidence.
4. Keep extracted facts short and attributable. Do not invent a source that you did not actually open.
5. Use shell-based web fetching only as an explicit fallback after both lightweight network and browser paths are unavailable or failed, and state that fallback clearly.
6. If a page exposes a direct document URL, prefer `download_url` to bring it local before switching into document-reading tools.
7. When verification requires reachability proof, include `http_probe` or equivalent runtime evidence.
8. When the user asks for a document or notes file, write the summary to the requested path before finishing.
