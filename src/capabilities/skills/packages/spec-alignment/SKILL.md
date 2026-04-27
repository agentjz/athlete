---
schema_version: skill.v1
name: spec-alignment
description: Keep SPEC and implementation narratives aligned when behavior, interfaces, or constraints change.
version: 1.0.0
load_mode: suggested
agent_kinds: lead, teammate
roles: reviewer, writer, implementer
task_types: documentation, specification
scenes: spec, docs, architecture
required_tools: read_file, search_files
optional_tools: write_file, edit_file
trigger_keywords: spec, docs, architecture, readme
---
# Spec Alignment

Use this workflow when code changes alter contract-level behavior or documented constraints.

1. Verify which behavior changed in code, not just in intention.
2. Update only the SPEC sections that describe the affected boundary, invariant, or workflow.
3. Keep “current capability” separate from “future direction”.
4. Avoid vague roadmap language when the implementation already made a concrete choice.
5. In the final report, call out which SPEC files were synchronized and why.
