import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinanceTimeFormatter} from '../src/finance/time.ts';

test('declared quote zone handles date rollover and seasonal offsets',()=>{
  const format=createFinanceTimeFormatter('en-US','America/Los_Angeles');
  const winter=format('2026-01-02T04:05:06.000Z');
  assert.equal(winter.text,'01/01, 20:05:06');
  assert.equal(winter.timeZone,'America/Los_Angeles');
  assert.match(winter.title,/2026/);
  assert.match(winter.title,/GMT-08:00 \(America\/Los_Angeles\)$/);
  const summer=format('2026-07-02T04:05:06.000Z');
  assert.equal(summer.text,'07/01, 21:05:06');
  assert.match(summer.title,/GMT-07:00 \(America\/Los_Angeles\)$/);
});

test('interface language formats the same market instant without choosing its zone',()=>{
  const instant='2026-07-02T04:05:06.000Z';
  const english=createFinanceTimeFormatter('en-US','America/Los_Angeles')(instant);
  const chinese=createFinanceTimeFormatter('zh-CN','America/Los_Angeles')(instant);
  assert.equal(chinese.timeZone,english.timeZone);
  assert.equal(chinese.text,'07/01 21:05:06');
  assert.notEqual(chinese.title,english.title);
  assert.match(chinese.title,/2026\/07\/01/);
  assert.match(chinese.title,/GMT-07:00/);
  assert.match(chinese.title,/\(America\/Los_Angeles\)$/);
});

test('absent and invalid market zones fall back to the runtime local zone',()=>{
  const instant='2026-10-25T04:00:00.000Z';
  const localZone=new Intl.DateTimeFormat().resolvedOptions().timeZone;
  const expected=createFinanceTimeFormatter('en-US',localZone)(instant);
  for(const zone of [undefined,null,'','   ','Not/A_Zone','GMT+99',42,{}]){
    assert.deepEqual(createFinanceTimeFormatter('en-US',zone)(instant),expected);
  }
  assert.equal(createFinanceTimeFormatter('zh-CN')(instant).timeZone,localZone);
  assert.equal(createFinanceTimeFormatter('en-US',' America/Los_Angeles ')(instant).timeZone,'America/Los_Angeles');
});

test('date-only NAV observations keep their calendar date and claim no time zone',()=>{
  const date='2026-07-02';
  assert.deepEqual(createFinanceTimeFormatter('en-US','America/Los_Angeles')(date),{text:'07/02/2026',title:'07/02/2026',timeZone:null});
  assert.deepEqual(createFinanceTimeFormatter('zh-CN','Pacific/Kiritimati')(date),{text:'2026/07/02',title:'2026/07/02',timeZone:null});
});

test('missing, invalid and impossible calendar dates remain unavailable',()=>{
  const format=createFinanceTimeFormatter('en-US','America/Los_Angeles');
  for(const value of [undefined,null,'',' ','not a date','2026-02-30','2026-13-01'])assert.equal(format(value),null);
});
