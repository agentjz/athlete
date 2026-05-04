---
schema_version: skill
name: mineru-image-reading
description: Read image documents through MinerU precision parsing or tokenless Agent lightweight parsing, then work from extracted Markdown artifacts instead of raw pixels.
version: 1.0.0
agent_kinds: lead, teammate
task_types: research, review, extraction, ocr
scenes: image, screenshot, receipt
required_tools: mineru_image_read
optional_tools: read
trigger_keywords: image, screenshot, receipt, photo, png, jpg, jpeg, jp2, webp, gif, bmp
---
# MinerU Image Reading

Use this skill when the user gives you a document-like image and wants OCR or layout-aware extraction.

1. Call `mineru_image_read` instead of raw file reading.
2. Let MinerU produce Markdown artifacts under the project state directory; tokenless runs may use the Agent lightweight API.
3. Prefer structured headings, tables, and OCR output over manual visual guessing.
4. Keep follow-up reads narrow by opening only the Markdown slices you still need.
