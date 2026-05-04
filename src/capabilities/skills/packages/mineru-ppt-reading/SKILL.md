---
schema_version: skill
name: mineru-ppt-reading
description: Read .ppt and .pptx presentation files through MinerU precision parsing or tokenless Agent lightweight parsing, then work from extracted Markdown artifacts.
version: 1.0.0
agent_kinds: lead, teammate
task_types: research, review, extraction, presentation
scenes: ppt, pptx, slides, presentation, deck
required_tools: mineru_ppt_read
optional_tools: read
trigger_keywords: ppt, pptx, slides, presentation, deck
---
# MinerU PPT Reading

Use this skill when the user gives you a slide deck and wants its content extracted or summarized.

1. Call `mineru_ppt_read` instead of raw file reading.
2. Let MinerU produce Markdown artifacts under the project state directory; tokenless runs may use the Agent lightweight API.
3. Summarize slide structure, titles, and ordered content before diving into details.
4. Keep any follow-up reads focused on the exact slides or sections still needed.
