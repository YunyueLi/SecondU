// Offsets use JavaScript UTF-16 units, matching String.slice and the source.
// Nearby text overlaps so ordinary sentences spanning a boundary remain visible.
export const CAPTURE_PART_CHARS=40000;
export const CAPTURE_OVERLAP_CHARS=1000;
const insidePair=(text,offset)=>offset>0&&offset<text.length&&text.charCodeAt(offset)>=0xdc00&&text.charCodeAt(offset)<=0xdfff&&text.charCodeAt(offset-1)>=0xd800&&text.charCodeAt(offset-1)<=0xdbff;
export function captureParts(text){
  const parts=[];let end=0;
  do{
    let start=parts.length?Math.max(0,end-CAPTURE_OVERLAP_CHARS):0;
    if(insidePair(text,start))start--;
    end=Math.min(text.length,start+CAPTURE_PART_CHARS);
    if(end<text.length){
      const newline=text.lastIndexOf('\n',end-1);
      if(newline>=start+CAPTURE_PART_CHARS*0.75)end=newline+1;
      if(insidePair(text,end))end--;
    }
    parts.push({start,end,status:'pending'});
  }while(end<text.length);
  return {version:1,totalCharacters:text.length,nextPart:0,parts};
}
export function capturePart(capture){
  const progress=capture.processing;
  if(!progress)return {start:0,end:Math.min(capture.text.length,CAPTURE_PART_CHARS),index:0,total:1};
  const part=progress.parts[progress.nextPart];
  if(!part)throw new Error('材料的分段进度无效。');
  return {...part,index:progress.nextPart,total:progress.parts.length};
}
export function partText(capture){const part=capturePart(capture);return capture.text.slice(part.start,part.end);}
export function partAttachments(capture){return capturePart(capture).index===0?capture.attachmentIds:[];}
