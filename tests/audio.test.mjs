import test from 'node:test';
import assert from 'node:assert/strict';
import {GameAudio} from '../dist/audio.js';

class Context {
  constructor(){this.state='suspended';this.destination={};this.created=[];}
  async resume(){this.state='running';}
  createGain(){return {gain:{value:0},connect(){},disconnect(){}};}
  async decodeAudioData(){return {duration:1};}
  createBufferSource(){const source={playbackRate:{value:1},connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};this.created.push(source);return source;}
}
const fetchAudio=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
const create=options=>new GameAudio({AudioContext:Context,fetch:fetchAudio,storage:{getItem(){return null;},setItem(){}},visible:()=>true,...options});
test('a voice clip and impact can play together; the next callout replaces only the voice',async()=>{const audio=create();assert.equal(await audio.play('fire'),true);const first=audio.voice;await audio.play('punch');const punch=audio.ctx.created.at(-1);await audio.play('clone');assert.equal(first.stopped,true);assert.equal(punch.stopped,undefined);assert.notEqual(audio.voice,first);});
test('mute stops all current sounds and prevents later playback',async()=>{const audio=create();await audio.play('fire');await audio.play('slap');const playing=[...audio.sources];audio.setEnabled(false);assert.equal(audio.sources.size,0);assert.ok(playing.every(s=>s.stopped));assert.equal(await audio.play('lightning'),false);});
test('a pending audio load cannot play after pause or mute',async()=>{
  for(const mute of [false,true]){
    let release;const gate=new Promise(resolve=>{release=resolve;});
    const audio=create({fetch:()=>gate});const pending=audio.play('fire');
    audio.stop();if(mute)audio.setEnabled(false);
    release({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
    assert.equal(await pending,false);assert.equal(audio.sources.size,0);assert.equal(audio.ctx.created.length,0);
  }
});
test('mute preference is restored without starting audio or fetching files',async()=>{let requests=0;const audio=create({storage:{getItem(){return 'false';},setItem(){}},fetch:async()=>{requests++;return fetchAudio();}});assert.equal(await audio.play('fire'),false);assert.equal(requests,0);assert.equal(audio.ctx,null);});
test('hidden pages do not play; failed asset fetches do not throw into combat',async()=>{const hidden=create({visible:()=>false});assert.equal(await hidden.play('punch'),false);const missing=create({fetch:async()=>({ok:false})});assert.equal(await missing.play('fire'),false);assert.equal(missing.sources.size,0);});
test('unsupported audio or unknown sounds fail quietly',async()=>{const missing=create({AudioContext:null});assert.equal(await missing.play('fire'),false);assert.equal(await create().play('unknown'),false);});
test('browser fetch is called with its global receiver',async()=>{const audio=create({fetch:function(){assert.equal(this,globalThis);return fetchAudio();}});assert.equal(await audio.play('punch'),true);});
