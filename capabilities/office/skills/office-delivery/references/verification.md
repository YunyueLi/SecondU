# Saved-file rendering, PDF export and formula recalculation

Adapted from DeepSeek Harness office-render, office-export-pdf and office-recalculate. The helper uses the installed LibreOffice Kit API and returns its real manifests and missing-font diagnostics. It does not claim visual acceptance.

- `render INPUT NEW_DIRECTORY [SHEET] [RANGE]`: render saved Office/PDF pages or an exact worksheet/range. Reuse previews only while the source is unchanged. Read the returned PNG paths, page counts and missing-font information. Inspect through an available image-reading tool. Transparent or uniformly blank output for populated content is a failed preview; stop and report visual verification incomplete rather than repeatedly reading the same image or substituting imaginary screenshots.
- `pdf INPUT NEW.pdf`: export a new PDF, preserving the source. Check nonempty bytes and the `%PDF-` signature. Successful conversion alone does not prove the layout was reviewed.
- `recalculate INPUT NEW.xlsx`: recalculate and preserve formulas. Reopen the actual saved file and compare formula expressions and cached results with known expected values; conversion does not prove business logic.

Operations are bounded and cancellable; preserve diagnostic error codes. Do not retry a failed unchanged input with different backends or mislabel a partial export as final. Keep previews in a clearly separated task-local verification folder so they are not mistaken for requested deliverables. Keep requested outputs in place. Report checks actually run and unresolved limitations in ordinary language.
