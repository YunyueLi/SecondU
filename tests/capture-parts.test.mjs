import test from 'node:test';
import assert from 'node:assert/strict';
import {captureParts,CAPTURE_PART_CHARS} from '../server/capture-parts.mjs';

test('parts cover empty, short, long, paragraph and supplementary-Unicode text without splitting a pair',()=>{
  for(const text of ['', '短文', 'x'.repeat(200000), ('一段文字😀。\n').repeat(16000), 'x'.repeat(39999)+'😀'+'y'.repeat(50000)]){
    const progress=captureParts(text);let end=0;
    for(const part of progress.parts){
      assert.ok(part.start<=end);assert.ok(part.end> end||text.length===0);
      assert.ok(part.end-part.start<=CAPTURE_PART_CHARS);
      const value=text.slice(part.start,part.end);
      assert.ok(!value||!/[\uDC00-\uDFFF]/.test(value[0]));
      assert.ok(!value||!/[\uD800-\uDBFF]/.test(value.at(-1)));
      end=part.end;
    }
    assert.equal(end,text.length);
  }
});
