# Word documents

Derived from DeepSeek Harness office-docx. Read the original document's paragraphs, tables, headers/footers and styles before editing. Match the existing structure unless the user requests redesign. Establish page size, margins, heading levels and typography before creating content. Use semantic headings and table headers; avoid repeated spaces for alignment.

Use the bundled `docx` library for authoring. `scripts/office.mjs docx spec.json report.docx` accepts a title and sections containing headings, paragraphs and simple tables; use a task-local script for headers, footers, numbering, images and complex tables. Opening an existing DOCX through a creation library does not preserve all features. For surgical edits preserve untouched XML parts, validate the resulting archive and render affected pages; never silently rebuild a complex original as plain text.

Reopen the final file, verify all expected paragraphs and table cells, then render affected pages. Inspect page breaks, heading hierarchy, line wrapping, table width and clipping. Fix findings and rerender only changed pages. Deliver the saved file and distinguish content validation from visual review.
