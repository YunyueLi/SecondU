import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createPdfFixture, pdfFixture } from '../src/dev/pdfFixture.mjs';
import { artifactContentSize, embeddedFile } from '../src/artifacts/format.mjs';

const assets = fileURLToPath(new URL('../node_modules/pdfjs-dist/', import.meta.url));
const options = { standardFontDataUrl: `${assets}standard_fonts/`, cMapUrl: `${assets}cmaps/`, cMapPacked: true, wasmUrl: `${assets}wasm/`, useWorkerFetch: false, verbosity: 0 };

test('real PDF bytes survive parsing and render two differently sized pages locally', async () => {
  const original = embeddedFile(pdfFixture.content, 'application/pdf');
  assert.deepEqual(original, createPdfFixture());
  assert.equal(artifactContentSize(pdfFixture), original.byteLength);
  const snapshot = original.slice();
  const task = getDocument({ ...options, data: original.slice() });
  try {
    const pdf = await task.promise;
    assert.equal(pdf.numPages, 2);
    for (const [number, dimensions, title] of [[1, [612, 792], 'A clearer view of the work'], [2, [792, 612], 'Evidence stays beside the result']]) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      assert.deepEqual([viewport.width, viewport.height], dimensions);
      assert.ok((await page.getTextContent()).items.some(item => item.str === title));
      const target = pdf.canvasFactory.create(viewport.width, viewport.height);
      try {
        await page.render({ canvas: target.canvas, viewport }).promise;
        const pixels = target.context.getImageData(0, 0, viewport.width, viewport.height).data;
        let darkPixels = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 180 && pixels[i + 1] < 180 && pixels[i + 2] < 180 && pixels[i + 3] > 0) darkPixels++;
        assert.ok(darkPixels > 1000, `page ${number} must contain rendered text and artwork, not a blank canvas`);
      } finally { pdf.canvasFactory.destroy(target); page.cleanup(); }
    }
  } finally { await task.destroy(); }
  assert.deepEqual(original, snapshot, 'the worker must not detach or alter bytes used by download');
});

test('a PDF signature alone is not accepted as a renderable document', async () => {
  const task = getDocument({ ...options, data: new TextEncoder().encode('%PDF-1.7\nThis is not a PDF body.\n%%EOF') });
  try { await assert.rejects(task.promise, { name: 'InvalidPDFException' }); }
  finally { await task.destroy(); }
});
