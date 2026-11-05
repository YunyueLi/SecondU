# Excel workbooks

Derived from DeepSeek Harness office-xlsx and office-recalculate. First inspect sheet names, dimensions, formula cells, named ranges, number formats and relevant tables/charts. Preserve unaffected sheets and formulas. Define units, currencies, date treatment, missing values, aggregation grain and source references before calculating.

Use `exceljs` for workbook reading and writing. The helper's xlsx command accepts sheets with rows, optional widths and number formats. A cell may be a primitive or `{formula: "SUM(B2:B4)"}`. Write formulas without a leading equals sign. Keep inputs, calculations and outputs recognizable; use number formats rather than converting values to display strings. Escape untrusted imported strings that begin with formula markers when they are intended as text.

Formula creation is not recalculation. Run `recalculate input.xlsx recalculated.xlsx` to refresh caches through LibreOffice Kit. Inspect the recalculated file: confirm formulas remain, cached values match expected totals and data types, and original sheets/styles are retained. Check for spreadsheet error values and stale or absent caches. Do not substitute constants for requested formulas or call unexecuted calculations verified.

For visual changes, render the exact sheet and affected A1 range, including charts/drawings. Inspect labels, widths, clipped text, date/currency/percentage formats and color contrast. Worksheet indices are not PDF page numbers. Change print areas and scaling only when relevant to the requested print/PDF output.
