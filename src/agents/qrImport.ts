import jsQR from 'jsqr';
import { t } from '../i18n.ts';
import { decodeCard, validateCardSource, type AgentCard } from '../cognition/qr.ts';

export type AgentImportPreview={kind:'card';card:AgentCard}|{kind:'source';sourceUrl:string;hostname:string};
export function parseAgentImport(text:string):AgentImportPreview {
  const value=text.trim();
  if(value.startsWith('{')||/^hither:/i.test(value))return {kind:'card',card:decodeCard(value)};
  const sourceUrl=validateCardSource(value);
  return {kind:'source',sourceUrl,hostname:new URL(sourceUrl).hostname};
}
export function decodeAgentQR(pixels:Uint8ClampedArray,width:number,height:number):{text:string;preview:AgentImportPreview} {
  const decoded=jsQR(pixels,width,height);
  if(!decoded)throw new Error(t('没有识别到二维码，请换一张更清晰的图片。','No QR code found. Try a clearer image.'));
  return {text:decoded.data,preview:parseAgentImport(decoded.data)};
}
