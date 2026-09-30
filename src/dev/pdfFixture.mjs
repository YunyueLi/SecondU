// Synthetic, self-contained two-page PDF. ASCII streams keep xref byte offsets exact.
export function createPdfFixture() {
  const line = (text, x, y, size = 12) => `BT /F1 ${size} Tf ${x} ${y} Td (${text.replace(/[\\()]/g, '\\$&')}) Tj ET`;
  const first = [
    '0.985 0.977 0.955 rg 0 0 612 792 re f',
    '0.35 0.38 0.34 rg', line('SECONDU  /  FICTIONAL REVIEW EXAMPLE', 48, 734, 10),
    '0.12 0.14 0.12 rg', line('A clearer view of the work', 48, 674, 28),
    line('Results, supporting evidence, and the next decision.', 48, 644, 12),
    '1 1 1 rg 48 434 516 160 re f',
    '0.24 0.30 0.25 rg', line('Review progress', 70, 563, 16),
    line('Task framing', 70, 528), line('Implementation', 70, 494), line('Review notes', 70, 460),
    '0.88 0.90 0.86 rg 222 522 318 10 re f 222 488 318 10 re f 222 454 318 10 re f',
    '0.40 0.48 0.38 rg 222 522 294 10 re f 222 488 248 10 re f 222 454 190 10 re f',
    '0.12 0.14 0.12 rg', line('What this file verifies', 48, 380, 18),
    line('1. Local PDF rendering with no browser plugin.', 48, 341),
    line('2. Fit-width zoom and a single page on screen.', 48, 312),
    line('3. Page navigation with different page dimensions.', 48, 283),
    '0.45 0.47 0.42 rg', line('These values are illustrative and do not describe a real run.', 48, 120, 10),
    line('SECOND U / REVIEW PACKET', 48, 50, 9), line('1 / 2', 531, 50, 10),
  ].join('\n');
  const second = [
    '0.985 0.977 0.955 rg 0 0 792 612 re f',
    '0.35 0.38 0.34 rg', line('SECONDU  /  FICTIONAL REVIEW EXAMPLE', 48, 558, 10),
    '0.12 0.14 0.12 rg', line('Evidence stays beside the result', 48, 500, 26),
    line('Landscape page - the reader recalculates fit width for each page.', 48, 470),
    '1 1 1 rg 48 184 696 242 re f',
    '0.24 0.30 0.25 rg', line('CHECK', 70, 394, 10), line('EXPECTED RESULT', 280, 394, 10),
    '0.90 0.90 0.87 RG 70 375 m 722 375 l S',
    '0.12 0.14 0.12 rg', line('Previous / next', 70, 340), line('Only the selected page is rendered.', 280, 340),
    line('Resize the viewer', 70, 297), line('The page fits the available width.', 280, 297),
    line('Download original', 70, 254), line('Original bytes remain intact after rendering.', 280, 254),
    line('Exit this view', 70, 211), line('Rendering and worker resources are released.', 280, 211),
    '0.45 0.47 0.42 rg', line('SYNTHETIC FIXTURE / NO PERSONAL INFORMATION', 48, 50, 9), line('2 / 2', 711, 50, 10),
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${first.length} >>\nstream\n${first}\nendstream`,
    `<< /Length ${second.length} >>\nstream\n${second}\nendstream`,
  ];
  let content = '%PDF-1.7\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(content.length); content += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = content.length;
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(content);
}

export const pdfFixture = {
  name: 'SecondU-review-example.pdf', type: 'text', encoding: 'data-url', mime: 'application/pdf',
  content: `data:application/pdf;base64,${btoa(new TextDecoder().decode(createPdfFixture()))}`,
  size: createPdfFixture().byteLength,
};
