'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
function clock(original=90,bpm=90,map=[90,150,110,70,40,90]){
  const window={};
  runInNewContext(readFileSync(require.resolve('../renderer/play12-playback.js'),'utf8'),{window});
  const audio={currentTime:0};
  return {audio,clock:new window.Play12Playback.PlaybackClock(audio,bpm,0,map.map((bpm,at)=>({at,bpm})),original)};
}
test('tempo author variations use a reversible absolute shift and a floor, without an upper effective clamp',()=>{
  const {clock:c}=clock();
  c.setBpm(60);
  assert.deepEqual(Array.from(c.tempo,e=>e.bpm),[60,120,80,40,20,60]);
  assert.deepEqual(Array.from(c.sourceTempo,e=>e.bpm),[90,150,110,70,40,90]);
  c.setBpm(300);
  assert.equal(c.effectiveBpmAt(1),360);
  c.setBpm(90,true);
  assert.deepEqual(Array.from(c.tempo,e=>e.bpm),[90,150,110,70,40,90]);
});
test('live tempo-map update preserves score position and integrates correctly across boundaries',()=>{
  const {clock:c,audio}=clock();
  c.start(0);
  audio.currentTime=.5;
  assert.equal(c.position,.75);
  c.setBpm(60);
  assert.equal(c.position,.75);
  assert.equal(c.quarterToAudioTime(2),1.25);
  audio.currentTime=1.25;
  assert.equal(c.position,2);
  assert.equal(c.bpm,60);
});
test('a tempo edit before a scheduled attack retains the scheduled clock anchor',()=>{
  const {clock:c,audio}=clock();
  c.start(4,2);
  audio.currentTime=1;
  c.setBpm(60);
  assert.equal(c.anchorAudioTime,2);
  assert.equal(c.position,4);
  assert.equal(c.quarterToAudioTime(5),5);
});
test('author reference follows authored changes independently of the effective floor',()=>{
  const {clock:c}=clock(90,90,[90,150,20,350]);
  c.setBpm(60);
  assert.equal(c.originalBpmAt(1),150);
  assert.equal(c.effectiveBpmAt(1),120);
  assert.equal(c.originalBpmAt(2),20);
  assert.equal(c.effectiveBpmAt(2),20);
  assert.equal(c.tempoOffset(),-30);
  assert.equal(c.originalBpmAt(3),350);
  c.setBpm(90,true);
  assert.equal(c.tempoOffset(),0);
  assert.equal(c.effectiveBpmAt(3),350);
});
