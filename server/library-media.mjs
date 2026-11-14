import path from 'node:path';
import { imageMime } from './attachment-input.mjs';

/** Only passive media identified from bytes may render inline. Everything else
 * remains a download, independent of a caller-controlled name or extension. */
export function libraryMediaMime(bytes, name) {
  const image = imageMime(bytes); if (image) return image;
  const ext = path.extname(name).toLowerCase();
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE') return 'audio/wav';
  if (ext === '.mp3' && (bytes.subarray(0, 3).toString() === 'ID3' || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (bytes.subarray(4, 8).toString() === 'ftyp') return ['.m4a', '.aac'].includes(ext) ? 'audio/mp4' : 'video/mp4';
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && ext === '.webm') return 'video/webm';
  if (bytes.subarray(0, 4).toString() === 'OggS') return 'audio/ogg';
}

export async function streamLibraryFile(file, req, res, { inline = false } = {}) {
  const { handle, name, size } = file;
  try {
    const header = Buffer.alloc(Math.min(size, 512)); await handle.read(header, 0, header.length, 0);
    const mime = inline ? libraryMediaMime(header, name) : undefined;
    const headers = { 'Content-Type': mime ?? 'application/octet-stream', 'Content-Disposition': `${mime ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" };
    let start = 0, end = size - 1, status = 200;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || !match[1] && !match[2]) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }); res.end(); await handle.close(); return; }
      if (!match[1]) start = Math.max(0, size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      if (![start, end].every(Number.isSafeInteger) || start > end || start < 0 || start >= size) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }); res.end(); await handle.close(); return; }
      status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
    res.writeHead(status, { ...headers, 'Content-Length': Math.max(0, end - start + 1) });
    if (req.method === 'HEAD' || !size) { res.end(); await handle.close(); return; }
    const stream = handle.createReadStream({ start, end }); stream.on('error', () => res.destroy()); res.once('close', () => stream.destroy()); stream.pipe(res);
  } catch (error) { await handle.close().catch(() => {}); throw error; }
}
