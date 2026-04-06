---
schema_version: skill.v1
name: pdf-reading
description: Read PDFs through the MinerU standard API and work from Markdown artifacts instead of raw binary bytes.
version: 1.0.0
load_mode: suggested
agent_kinds: lead, teammate
roles: implementer, reviewer, writer
task_types: research, review, extraction, documentation
scenes: pdf
required_tools: read_pdf
optional_tools: read_file, search_files
trigger_keywords: pdf, paper, scanned, handbook, manual
---
# PDF Reading

Use this skill when the user gives you a PDF or asks for content from a scanned or layout-heavy document.

1. Call `read_pdf` instead of `read_file`.
2. Let MinerU produce Markdown artifacts under the project state directory.
3. Read only the needed subset of the extracted Markdown for downstream reasoning.
4. Prefer citing extracted structure, headings, and sections over raw binary guesses.
