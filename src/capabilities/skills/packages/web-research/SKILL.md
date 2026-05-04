---
schema_version: skill
name: web-research
description: Research public web information with lightweight network, download, and local reading tools.
version: 1.1.0
agent_kinds: lead, teammate
roles: implementer, reviewer, writer
task_types: research, documentation, validation
scenes: web, webpage, website, online
required_tools:
optional_tools: http_probe, http_request, http_session, http_suite, openapi_inspect, openapi_lint, download_url, write, read
trigger_keywords: web, webpage, website, online, latest news, latest updates, public info, open the page, open the website
trigger_patterns: ["https?://","(search|look up|find).*(web|website|webpage|online)","(open|visit).*(web|website|page)"]
---
# Web Research

Use this workflow when the user wants information from the public web and expects a summary, notes, or a written deliverable.

1. Start with lightweight network tools (`http_probe`, `http_request`, `openapi_*`) for API endpoints, static pages, and quick reachability checks.
2. Open additional sources only when the first source is insufficient, a fact needs cross-checking, or the user explicitly requests multi-source evidence.
3. Keep extracted facts short and attributable. Do not invent a source that you did not actually open.
4. Use shell-based web fetching only as an explicit fallback after lightweight network paths are unavailable or failed, and state that fallback clearly.
5. If a page exposes a direct document URL, prefer `download_url` to bring it local before switching into document-reading tools.
6. When verification requires reachability proof, include `http_probe` or equivalent runtime evidence.
7. When the user asks for a document or notes file, write the summary to the requested path before finishing.
