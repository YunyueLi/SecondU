import { createHash } from 'node:crypto';
import { HttpError } from './store.mjs';

export const ARTWORK_LIMIT = 8 * 1024 * 1024;
export const defaultAppearance = Object.freeze({ theme:'system', atmosphere:'pencil', decorativeArtwork:false, accent:'blue', opacity:96, fontSize:14, motion:'system', sendKey:'enter', language:'zh-CN' });
const options = {
  theme:['light','dark','system'], atmosphere:['plain','pencil','tidal','night','custom'],
  decorativeArtwork:[true,false],
  accent:['graphite','blue','violet','green'], motion:['system','reduced'], sendKey:['enter','modifier'], language:['zh-CN','en'],
};
const ranges = { opacity:[70,100], fontSize:[12,18] };

export function getAppearance(store) { return store.get('meta','appearance')?.value ?? null; }
export function saveAppearance(store, body) {
  for (const [key,value] of Object.entries(body)) {
    if (Object.hasOwn(options,key)) {
      if (!options[key].includes(value)) throw new HttpError(400,`外观选项 ${key} 无效`,'invalid_appearance');
    } else if (Object.hasOwn(ranges,key)) {
      const [min,max]=ranges[key];
      if (typeof value!=='number' || !Number.isFinite(value) || value<min || value>max) throw new HttpError(400,`外观选项 ${key} 需要在 ${min} 至 ${max} 之间`,'invalid_appearance');
    } else throw new HttpError(400,`不支持的外观选项：${key}`,'invalid_appearance');
  }
  return store.setMeta('appearance',{...defaultAppearance,...getAppearance(store),...body});
}

// Validate the file signature; browser image decoding remains responsible for full image validity.
function imageMime(data) {
  if (data.length>=24 && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && data.toString('latin1',12,16)==='IHDR') return 'image/png';
  if (data.length>=4 && data[0]===0xff && data[1]===0xd8 && data[2]===0xff) return 'image/jpeg';
  if (data.length>=20 && data.toString('latin1',0,4)==='RIFF' && data.toString('latin1',8,12)==='WEBP' && ['VP8 ','VP8L','VP8X'].includes(data.toString('latin1',12,16))) return 'image/webp';
  if (data.length>=24 && data.toString('latin1',4,8)==='ftyp') {
    const size=data.readUInt32BE(0);
    if (size>=24 && size<=data.length && size%4===0) {
      const brands=[data.toString('latin1',8,12)];
      for (let offset=16;offset<size;offset+=4) brands.push(data.toString('latin1',offset,offset+4));
      if (brands.some(brand=>brand==='avif'||brand==='avis')) return 'image/avif';
    }
  }
  return null;
}

export function saveArtwork(store, body) {
  if (Object.keys(body).some(key=>!['mime','base64'].includes(key)) || !['image/png','image/jpeg','image/webp','image/avif'].includes(body.mime)) throw new HttpError(400,'请选择 PNG、JPEG、WebP 或 AVIF 图片','invalid_artwork');
  if (typeof body.base64!=='string' || body.base64.length===0) throw new HttpError(400,'图片内容为空','invalid_artwork');
  if (body.base64.length>Math.ceil(ARTWORK_LIMIT/3)*4) throw new HttpError(413,'图片不能超过 8 MB','artwork_too_large');
  if (body.base64.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64)) throw new HttpError(400,'图片编码无效','invalid_artwork');
  const data=Buffer.from(body.base64,'base64');
  if (data.length>ARTWORK_LIMIT) throw new HttpError(413,'图片不能超过 8 MB','artwork_too_large');
  if (data.toString('base64')!==body.base64 || imageMime(data)!==body.mime) throw new HttpError(400,'图片格式与内容不一致，或文件格式不受支持','invalid_artwork');
  const revision=createHash('sha256').update(data).digest('hex');
  const info={revision,mime:body.mime,bytes:data.length};
  store.transaction(()=>{
    store.setMeta('local-artwork',{...info,base64:body.base64});
    store.setMeta('local-artwork-info',info);
  });
  return {revision};
}

export function getArtworkInfo(store) { return store.get('meta','local-artwork-info')?.value ?? null; }
export function getArtwork(store) {
  const artwork=store.get('meta','local-artwork')?.value;
  if (!artwork) throw new HttpError(404,'尚未设置自定义图片','artwork_not_found');
  return { ...artwork, data:Buffer.from(artwork.base64,'base64') };
}
