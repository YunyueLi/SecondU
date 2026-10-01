/** Distance to the actual nontransparent pixels, never to a containing box. */
export function alphaDistance(pixels:Uint8ClampedArray,width:number,height:number,threshold=2) {
 const distances=new Float32Array(width*height),diagonal=Math.SQRT2;
 let occupied=0;
 for(let i=0;i<distances.length;i++) {
  const opaque=pixels[i*4+3]>=threshold;
  distances[i]=opaque?0:10000;if(opaque)occupied++;
 }
 for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
  const i=y*width+x;
  if(x)distances[i]=Math.min(distances[i],distances[i-1]+1);
  if(y)distances[i]=Math.min(distances[i],distances[i-width]+1);
  if(x&&y)distances[i]=Math.min(distances[i],distances[i-width-1]+diagonal);
  if(x<width-1&&y)distances[i]=Math.min(distances[i],distances[i-width+1]+diagonal);
 }
 for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--) {
  const i=y*width+x;
  if(x<width-1)distances[i]=Math.min(distances[i],distances[i+1]+1);
  if(y<height-1)distances[i]=Math.min(distances[i],distances[i+width]+1);
  if(x<width-1&&y<height-1)distances[i]=Math.min(distances[i],distances[i+width+1]+diagonal);
  if(x&&y<height-1)distances[i]=Math.min(distances[i],distances[i+width-1]+diagonal);
 }
 return {distances,occupied};
}
