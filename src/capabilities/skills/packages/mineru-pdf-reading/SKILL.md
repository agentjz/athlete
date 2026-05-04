---
schema_version: skill
name: mineru-pdf-reading
description: Read PDF documents through MinerU precision parsing or tokenless Agent lightweight parsing, then work from Markdown artifacts instead of raw binary bytes.
version: 1.0.0
agent_kinds: lead, teammate
task_types: research, review, extraction, documentation
scenes: pdf
required_tools: mineru_pdf_read
optional_tools: read
trigger_keywords: pdf, paper, scanned, handbook, manual
---
# MinerU PDF Reading

Use this skill when the user gives you a PDF or asks for content from a scanned or layout-heavy document.

1. Call `mineru_pdf_read` instead of raw file reading.
2. Let MinerU produce Markdown artifacts under the project state directory; tokenless runs may use the Agent lightweight API.
3. If the PDF is still remote, acquire it first with `download_url` so the document chain can continue locally.
4. Read only the needed subset of the extracted Markdown for downstream reasoning.
5. Prefer citing extracted structure, headings, sections, and page evidence over raw binary guesses.
