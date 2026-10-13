import test from 'node:test';
import assert from 'node:assert/strict';
import {SealSequence,classify,JUTSUS,handFeatures} from '../dist/seals.js';
function hold(s,id,t){s.update(id,t);return s.update(id,t+650);}
test('all three combos cast only after the correct stable ordered seals',()=>{for(const j of JUTSUS){const s=new SealSequence(j.sequence);for(let i=0;i<3;i++)assert.equal(hold(s,j.sequence[i],i*1000).type,i===2?'cast':'accepted');}});
test('one held seal cannot complete or repeatedly advance a combo',()=>{const s=new SealSequence(['rat','ox','bird']);hold(s,'rat',0);for(let t=1000;t<10000;t+=100)assert.equal(s.update('rat',t),null);assert.equal(s.index,1);});
test('wrong stable seal resets progress',()=>{const s=new SealSequence(['rat','ox','bird']);hold(s,'rat',0);assert.equal(hold(s,'bird',1000).type,'wrong');assert.equal(s.index,0);});
test('brief transitional poses do not reset or advance progress',()=>{const s=new SealSequence(['rat','ox','bird']);hold(s,'rat',0);s.update('bird',1000);s.update('bird',1200);assert.equal(s.index,1);assert.equal(hold(s,'ox',1300).type,'accepted');});
test('sequence expires after twelve seconds even with no detected hands',()=>{const s=new SealSequence(['rat','ox','bird']);hold(s,'rat',0);assert.equal(s.update(null,13000).type,'timeout');assert.equal(s.index,0);});
test('missing hands and malformed landmarks never classify',()=>{for(const hands of [[],null,[[]],[[],[]]])assert.equal(classify(hands).id,null);});
function hand(fingers,offset=0){const h=Array.from({length:21},()=>({x:offset,y:.8,z:0}));for(let j=0;j<4;j++){const base=5+j*4,x=offset+(j-1.5)*.025;h[base]={x,y:.65,z:0};h[base+1]={x,y:.57,z:0};h[base+2]={x,y:fingers[j]?.49:.64,z:0};h[base+3]={x,y:fingers[j]?.42:.72,z:0};}return h;}
test('distinct simplified hand shapes classify independently of target combo',()=>{const sets={rat:[hand([1,1,0,0],.45),hand([0,0,0,0],.55)],ox:[hand([1,0,0,1],.45),hand([1,0,0,1],.55)],bird:[hand([1,1,1,1],.45),hand([1,1,1,1],.55)]};for(const [id,h] of Object.entries(sets)){assert.equal(classify(h).id,id);assert.equal(classify([...h].reverse()).id,id);assert.ok(classify(h).score>.35);}});
test('two closed fists do not match a seal; far apart hands do not match',()=>{assert.equal(classify([hand([0,0,0,0],.45),hand([0,0,0,0],.55)]).id,null);assert.equal(classify([hand([1,1,1,1],.1),hand([1,1,1,1],.9)]).id,null);});
test('landmark features are invariant to image translation and scale',()=>{const h=[hand([1,1,0,0],.45),hand([0,0,0,0],.55)];const transformed=h.map(hand=>hand.map(p=>({x:p.x*.5+.1,y:p.y*.5+.2,z:p.z*.5})));const a=handFeatures(h),b=handFeatures(transformed);assert.equal(classify(h).id,classify(transformed).id);assert.ok(Math.abs(a.contact-b.contact)<1e-9);});
