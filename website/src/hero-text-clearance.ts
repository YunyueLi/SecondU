import {alphaDistance} from './hero-alpha-distance';

type Glyph={text:string;x:number;top:number;bottom:number;font:string;direction:CanvasDirection};

/** Rasterize the current DOM typography once per layout/font change. Range
 * positions preserve real wrapping and each text node retains its own font,
 * including the serif title and the stronger introductory sentence. */
export function createTextClearance(nodes:Element[]) {
 const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
 const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
 let left=0,top=0,distances:Float32Array|null=null;
 return {
  measure(hostBounds:DOMRect) {
   if(!context)return;
   const glyphs:Glyph[]=[];
   let right=-Infinity,bottom=-Infinity;left=top=Infinity;
   for(const node of nodes) {
    const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
    let textNode:Node|null;
    while((textNode=walker.nextNode())) {
     const parent=textNode.parentElement;
     if(!parent)continue;
     const style=getComputedStyle(parent);
     if(style.display==='none'||style.visibility==='hidden')continue;
     const font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
     for(const {segment,index} of segmenter.segment(textNode.textContent??'')) {
      if(!segment.trim())continue;
      const range=document.createRange();range.setStart(textNode,index);range.setEnd(textNode,index+segment.length);
      const bounds=range.getBoundingClientRect();
      if(!bounds.width||!bounds.height)continue;
      const x=bounds.left-hostBounds.left,y=bounds.top-hostBounds.top,end=bounds.bottom-hostBounds.top;
      left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,bounds.right-hostBounds.left);bottom=Math.max(bottom,end);
      glyphs.push({text:segment,x,top:y,bottom:end,font,direction:style.direction==='rtl'?'rtl':'ltr'});
     }
    }
   }
   if(!glyphs.length){distances=null;return;}
   left=Math.floor(left)-16;top=Math.floor(top)-16;
   canvas.width=Math.ceil(right-left)+16;canvas.height=Math.ceil(bottom-top)+16;
   context.fillStyle='#fff';context.textBaseline='alphabetic';context.textAlign='left';
   for(const glyph of glyphs) {
    context.font=glyph.font;context.direction=glyph.direction;
    const metrics=context.measureText(glyph.text);
    const ascent=metrics.fontBoundingBoxAscent,descent=metrics.fontBoundingBoxDescent;
    // DOM Range rectangles use font extents. Match those extents to the same
    // canvas font's baseline rather than guessing from font size or line height.
    const baseline=glyph.top+(glyph.bottom-glyph.top-ascent-descent)/2+ascent;
    context.fillText(glyph.text,glyph.x-left,baseline-top);
   }
   const result=alphaDistance(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,12);
   distances=result.distances;
  },
  at(x:number,y:number) {
   if(!distances)return 1;
   const px=Math.floor(x-left),py=Math.floor(y-top);
   if(px<0||py<0||px>=canvas.width||py>=canvas.height)return 1;
   // A narrow falloff protects the small moving glyph itself while leaving
   // genuine line ends, line gaps and large letter counters available.
   const ramp=Math.max(0,Math.min(1,(distances[py*canvas.width+px]-5)/5));
   return ramp*ramp*(3-2*ramp);
  },
  dispose(){distances=null;canvas.width=canvas.height=1;},
 };
}
