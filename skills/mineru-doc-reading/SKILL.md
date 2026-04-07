---
schema_version: skill.v1
name: mineru-doc-reading
description: Read .doc and .docx files through MinerU first, with native read_docx preserved as the explicit .docx fallback.
version: 1.0.0
load_mode: suggested
agent_kinds: lead, teammate
task_types: research, review, extraction, documentation
scenes: doc, docx, word
required_tools: mineru_doc_read
optional_tools: read_docx, edit_docx, search_files
trigger_keywords: doc, docx, word, proposal, contract, report
---
# MinerU Doc Reading

Use this skill when the user gives you a Word document and the goal is to read or analyze its content.

1. Call `mineru_doc_read` first for both `.doc` and `.docx`.
2. For `.docx`, accept the explicit native `read_docx` fallback only when MinerU is unavailable, misconfigured, failing, or unsupported.
3. Preserve `write_docx` and `edit_docx` for document creation and structured edits.
4. Work from the extracted Markdown or fallback structure summary instead of raw binary bytes.
