# Skills

Current skill naming rules:

- Use stable `kebab-case` names.
- Prefer two words; use three words only when needed.
- Treat the name as a capability ID, not a natural-language sentence.
- Keep abbreviations only for common domain terms such as `pdf`.
- Put detailed explanation in `description` and body headings, not in `name`.

Currently retained official skills:

- `test-guardrails`
  Purpose: test-first work, regression protection, and smaller change scope.
- `spec-alignment`
  Purpose: align implementation with SPEC and docs.
- `mineru-pdf-reading`
  Purpose: route PDF work through `mineru_pdf_read` and the MinerU extraction path.
- `mineru-image-reading`
  Purpose: route image document work through `mineru_image_read` and the MinerU extraction path.
- `mineru-doc-reading`
  Purpose: route `.doc` and `.docx` through `mineru_doc_read`; explicitly fall back to `read_docx` when `.docx` extraction fails.
- `mineru-ppt-reading`
  Purpose: route `.ppt` and `.pptx` through `mineru_ppt_read` and the MinerU extraction path.

Recommended future network-related skills:

- `web-research`
  Purpose: public web search, fetch, reading, and summarization.
- `browser-automation`
  Purpose: real browser interaction, authenticated pages, forms, and click flows.
