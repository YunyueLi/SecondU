/** Local pointer geometry stays bounded when a sample resizes or the pointer leaves. */
export function getLightStudyPointer(box, clientX, clientY) {
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const width = finite(box.width) ? Math.max(0, box.width) : 0;
  const height = finite(box.height) ? Math.max(0, box.height) : 0;
  const left = finite(box.left) ? box.left : 0;
  const top = finite(box.top) ? box.top : 0;
  return {
    x: finite(clientX) ? Math.max(0, Math.min(width, clientX - left)) : width / 2,
    y: finite(clientY) ? Math.max(0, Math.min(height, clientY - top)) : height / 2,
    radius: Math.max(28, Math.min(68, width * .2, height * .4)),
  };
}
