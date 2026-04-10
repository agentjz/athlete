---
schema_version: skill.v1
name: mineru-pdf-reading
description: Read PDF documents through MinerU and work from Markdown artifacts instead of raw binary bytes.
version: 1.0.0
load_mode: suggested
agent_kinds: lead, teammate
task_types: research, review, extraction, documentation
scenes: pdf
required_tools: mineru_pdf_read
optional_tools: read_file, search_files
trigger_keywords: pdf, paper, scanned, handbook, manual
---
# MinerU PDF Reading

Use this skill when the user gives you a PDF or asks for content from a scanned or layout-heavy document.

1. Call `mineru_pdf_read` instead of `read_file`.
2. Let MinerU produce Markdown artifacts under the project state directory.
3. If the PDF is still remote, acquire it first with `download_url` so the document chain can continue locally.
4. Read only the needed subset of the extracted Markdown for downstream reasoning.
5. Prefer citing extracted structure, headings, sections, and page evidence over raw binary guesses.
