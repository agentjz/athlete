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
3. Read only the needed subset of the extracted Markdown for downstream reasoning.
4. Prefer citing extracted structure, headings, and sections over raw binary guesses.
