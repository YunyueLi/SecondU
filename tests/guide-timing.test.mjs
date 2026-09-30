import test from 'node:test';
import assert from 'node:assert/strict';
import {createFilmTiming,filmFrameAt,filmIsComplete} from '../src/onboarding/filmTiming.ts';

test('ordinary chapters keep all authored cues on one 1.6x timeline and finish after one real cycle',()=>{
 const timing=createFilmTiming(19000);
 assert.equal(timing.playbackDuration,11875);
 assert.equal(filmFrameAt(timing,1750),2800,'the send click and its animation use the same cue');
 assert.equal(filmFrameAt(timing,9125),14600,'save state and pointer arrive together');
 assert.equal(filmIsComplete(timing,11874),false);
 assert.equal(filmIsComplete(timing,11875),true);
 assert.equal(filmFrameAt(timing,11875),0,'looping returns every surface to the same beginning');
});

test('long opening shots reach the fully visible next scene in 1.8 seconds without skipping later cues',()=>{
 for(const [duration,introUntil,total] of [[25500,6050,13956.25],[19000,9450,7768.75]]){
  const timing=createFilmTiming(duration,introUntil);
  assert.equal(timing.playbackDuration,total);
  assert.equal(filmFrameAt(timing,900),introUntil/2);
  assert.equal(filmFrameAt(timing,1800),introUntil);
  assert.equal(filmFrameAt(timing,2800),introUntil+1600);
  assert.equal(filmIsComplete(timing,total-1),false);
  assert.equal(filmIsComplete(timing,total),true);
  assert.equal(filmFrameAt(timing,total+900),introUntil/2,'the second loop uses the same opening compression');
 }
});

test('reduced motion immediately shows the final stable scene and completes without a time deadline',()=>{
 for(const timing of [createFilmTiming(19000),createFilmTiming(25500,6050)]){
  assert.equal(filmFrameAt(timing,0,true),timing.duration-600);
  assert.ok(filmFrameAt(timing,0,true)<timing.duration-550,'the final frame precedes the stage fade-out');
  assert.equal(filmFrameAt(timing,4000,true),filmFrameAt(timing,0,true));
  assert.equal(filmIsComplete(timing,0,true),true);
 }
});

test('explicit preview frames retain authored times and never mark a chapter watched',()=>{
 const timing=createFilmTiming(25500,6050);
 assert.equal(filmFrameAt(timing,20000,false,9600),9600);
 assert.equal(filmFrameAt(timing,0,true,9600),9600);
 assert.equal(filmIsComplete(timing,20000,false,9600),false);
 assert.equal(filmIsComplete(timing,0,true,9600),false);
});
