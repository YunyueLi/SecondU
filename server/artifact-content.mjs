import path from 'node:path';
import { HttpError } from './http-error.mjs';
import { OFFICE_TYPES, validateOfficeArchive } from './office-content.mjs';

export const BINARY_ARTIFACT_LIMIT = 8 * 1024 * 1024;
export const ARTIFACT_COLLECTION_LIMIT = 24 * 1024 * 1024;
export const BINARY_ARTIFACT_JSON_LIMIT = Math.ceil(BINARY_ARTIFACT_LIMIT / 3) * 4 + 4096;
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', ...Object.fromEntries(Object.entries(OFFICE_TYPES).map(([extension,type])=>[extension,type.mime])) };
const invalid = () => new HttpError(400, '产物原始字节、类型或编码无效。', 'invalid_artifact_content');
export function binaryArtifactMime(name) { return types[path.extname(name).toLowerCase()]; }
export function isBinaryArtifact(artifact) { return artifact.encoding === 'data-url' || !!binaryArtifactMime(artifact.name); }
function dimensions(width, height) {
  if (!width || !height || width > 16384 || height > 16384 || width * height > 40_000_000) throw new HttpError(413, '图片尺寸超过 16384 像素或 4000 万像素上限。', 'artifact_dimensions_limit');
}

/** Validate container boundaries and dimensions before these bytes reach a preview. */
function validateBinary(data, mime) {
  if (!Buffer.isBuffer(data) || !data.length) throw invalid();
  if (data.length > BINARY_ARTIFACT_LIMIT) throw new HttpError(413, '单个图片、PDF 或 Office 产物最多 8 MiB。', 'artifact_too_large');
  if (mime === 'image/png') {
    if (data.length < 45 || !data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || data.readUInt32BE(8) !== 13 || data.toString('ascii',12,16) !== 'IHDR') throw invalid();
    dimensions(data.readUInt32BE(16), data.readUInt32BE(20));
    let offset = 8, hasData = false, ended = false;
    while (offset + 12 <= data.length) {
      const length = data.readUInt32BE(offset), type = data.toString('ascii',offset+4,offset+8);
      if (offset + length + 12 > data.length) throw invalid();
      if (type === 'IDAT' && length) hasData = true;
      offset += length + 12;
      if (type === 'IEND') { ended = length === 0 && offset === data.length; break; }
    }
    if (!hasData || !ended) throw invalid();
  } else if (mime === 'image/jpeg') {
    if (data.length < 12 || data[0] !== 255 || data[1] !== 216 || data[2] !== 255 || data[data.length-2] !== 255 || data[data.length-1] !== 217) throw invalid();
    let offset = 2, found = false;
    while (offset + 4 <= data.length) {
      if (data[offset++] !== 255) throw invalid();
      while (data[offset] === 255) offset++;
      const marker = data[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      if (offset + 2 > data.length) throw invalid();
      const length = data.readUInt16BE(offset);
      if (length < 2 || offset + length > data.length) throw invalid();
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        if (length < 8) throw invalid();
        dimensions(data.readUInt16BE(offset+5), data.readUInt16BE(offset+3)); found = true;
      }
      offset += length;
    }
    if (!found) throw invalid();
  } else if (mime === 'image/gif') {
    if (data.length < 14 || !['GIF87a','GIF89a'].includes(data.toString('ascii',0,6)) || data.at(-1) !== 0x3b) throw invalid();
    dimensions(data.readUInt16LE(6), data.readUInt16LE(8));
    if (!data.subarray(13).includes(0x2c)) throw invalid();
  } else if (mime === 'image/webp') {
    if (data.length < 30 || data.toString('ascii',0,4) !== 'RIFF' || data.toString('ascii',8,12) !== 'WEBP' || data.readUInt32LE(4) + 8 !== data.length) throw invalid();
    let offset = 12, found = false;
    while (offset + 8 <= data.length) {
      const type = data.toString('ascii',offset,offset+4), length = data.readUInt32LE(offset+4), start = offset + 8;
      if (start + length > data.length) throw invalid();
      if (type === 'VP8X') {
        if (length < 10) throw invalid();
        dimensions(data.readUIntLE(start+4,3)+1, data.readUIntLE(start+7,3)+1); found = true;
      } else if (type === 'VP8L') {
        if (length < 5 || data[start] !== 0x2f) throw invalid();
        const bits = data.readUInt32LE(start+1); dimensions((bits & 0x3fff)+1, ((bits >>> 14)&0x3fff)+1); found = true;
      } else if (type === 'VP8 ') {
        if (length < 10 || !data.subarray(start+3,start+6).equals(Buffer.from([0x9d,0x01,0x2a]))) throw invalid();
        dimensions(data.readUInt16LE(start+6)&0x3fff, data.readUInt16LE(start+8)&0x3fff); found = true;
      }
      offset = start + length + (length % 2);
    }
    if (!found || offset !== data.length) throw invalid();
  } else if (mime === 'application/pdf') {
    if (!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n)/.test(data.toString('latin1',0,16)) || !/%%EOF\s*$/.test(data.toString('latin1',Math.max(0,data.length-1024)))) throw invalid();
  } else {const entry=Object.entries(OFFICE_TYPES).find(([,type])=>type.mime===mime);if(!entry)throw invalid();validateOfficeArchive('document'+entry[0],data);}
  return data;
}

export function encodeBinaryArtifact(name, data) {
  const mime = binaryArtifactMime(name);
  validateBinary(data, mime);
  return { content: `data:${mime};base64,${data.toString('base64')}`, encoding: 'data-url', mime, size: data.length };
}

export function decodeBinaryArtifact(artifact) {
  const mime = binaryArtifactMime(artifact.name);
  const match = typeof artifact.content === 'string' && /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(artifact.content);
  if (!mime || !match || match[1] !== mime || match[2].length % 4 || match[2].length > Math.ceil(BINARY_ARTIFACT_LIMIT / 3) * 4) throw invalid();
  const data = Buffer.from(match[2], 'base64');
  if (data.toString('base64') !== match[2] || artifact.mime !== undefined && artifact.mime !== mime || artifact.size !== undefined && artifact.size !== data.length) throw invalid();
  validateBinary(data, mime);
  return { data, mime };
}

export function artifactContentMetadata(name, content) {
  if (!binaryArtifactMime(name)) return {};
  const { data, mime } = decodeBinaryArtifact({ name, content });
  return { encoding: 'data-url', mime, size: data.length };
}

export function artifactBytes(artifact) {
  if (isBinaryArtifact(artifact)) return decodeBinaryArtifact(artifact);
  if (typeof artifact.content !== 'string') throw invalid();
  return { data: Buffer.from(artifact.content, 'utf8'), mime: 'text/plain; charset=utf-8' };
}

/** Resolve a saved revision without leaking current binary metadata into older bytes. */
export function artifactAtVersion(artifact, requested) {
  if (requested === undefined || requested === null) return artifact;
  if (!/^[1-9][0-9]*$/.test(String(requested)) || !Number.isSafeInteger(Number(requested))) throw new HttpError(400, '产物版本无效。', 'invalid_artifact_version');
  const version = Number(requested);
  if (version === artifact.version) return artifact;
  const snapshot = artifact.versions?.find(item => item.version === version);
  if (!snapshot) throw new HttpError(404, '此版本不存在。', 'artifact_version_missing');
  return { name: artifact.name, type: artifact.type, ...snapshot };
}
