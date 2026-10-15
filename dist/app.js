import {SEALS,JUTSUS,SealSequence,classify,sealArt} from './seals.js';
import {Effects} from './effects.js';
import {Battle,MotionDetector,SKILLS} from './battle.js';
import {BattleScene} from './battle-scene.js';
import {GameAudio} from './audio.js';
const $=id=>document.getElementById(id);
const video=$('video'), canvas=$('scene'), effects=new Effects(canvas);
const battle=new Battle(),motion=new MotionDetector(),arena=new BattleScene($('enemy-scene'),{resizeToParent:true});
const sound=new GameAudio();
function updateSoundButton(){const button=$('sound-toggle');button.textContent=sound.enabled?'🔊 เสียงเปิด':'🔇 ปิดเสียง';button.setAttribute('aria-pressed',String(sound.enabled));button.title=sound.enabled?'ปิดเสียงวิชาและเสียงปะทะ':'เปิดเสียงวิชาและเสียงปะทะ';}
$('sound-toggle').addEventListener('click',()=>{sound.setEnabled(!sound.enabled);updateSoundButton();if(sound.enabled)void sound.unlock();});
document.addEventListener('pointerdown',()=>{void sound.unlock();},{once:true});
document.addEventListener('keydown',()=>{void sound.unlock();},{once:true});
updateSoundButton();
let combatLog=[],hitFlashUntil=0,lastHud=0;
canvas.width=960;canvas.height=720;
let selected=JUTSUS[0], sequence=new SealSequence(selected.sequence), models=null, modelPromise=null;
let stream=null, running=false, loading=false, session=0, lastVideoTime=-1, lastInference=0, face=null, hands=[], count=0;
let calibration=null, templates={}, inferenceErrors=0;
try{const saved=JSON.parse(localStorage.getItem('ninja-seal-templates-v1')||'{}');for(const id of Object.keys(SEALS)){const t=saved[id];if(t&&Array.isArray(t.fingers)&&t.fingers.length===2&&t.fingers.every(a=>Array.isArray(a)&&a.length===4&&a.every(Number.isFinite))&&['contact','cross','tipContact'].every(k=>Number.isFinite(t[k])))templates[id]=t;}}catch{}
function notify(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function logCombat(message,enemy=false){
  const seconds=Math.floor(battle.elapsed),time=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  combatLog.unshift({message,time,enemy});combatLog=combatLog.slice(0,3);
  $('combat-log').replaceChildren(...combatLog.map(entry=>{const p=document.createElement('p'),time=document.createElement('time');time.textContent=entry.time;p.classList.toggle('enemy-event',entry.enemy);p.append(time,document.createTextNode(entry.message));return p;}));
}
function renderBattle(){
  const active=battle.status==='active',paused=battle.status==='paused',ended=['won','lost'].includes(battle.status),demo=battle.mode==='demo'&&battle.status!=='idle';
  $('player-hp').value=battle.hp;$('player-mp').value=battle.mp;$('enemy-hp').value=battle.enemyHp;
  $('hp-value').textContent=battle.hp+' / 100';$('mp-value').textContent=battle.mp+' / 100';$('enemy-hp-value').textContent=battle.enemyHp+' / 360';
  $('player-status').textContent=({idle:'พร้อมฝึก',active:demo?'DEMO':'กำลังต่อสู้',paused:'พักอยู่',won:'ชนะ!',lost:'พ่ายแพ้'})[battle.status];
  const seconds=Math.floor(battle.elapsed);$('battle-time').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  $('enemy-intent').classList.toggle('warning',active&&battle.telegraphed);
  $('enemy-intent').textContent=active?(battle.telegraphed?'⚠ มาดาระกำลังโจมตี! ใช้วิชาขัดจังหวะได้':`โจมตีถัดไปใน ${Math.ceil(battle.nextAttack-battle.elapsed)} วิ${battle.shieldUntil>battle.elapsed?' · แยกร่างป้องกันอยู่':''}`):paused?'พักการต่อสู้ · HP / MP หยุดเปลี่ยน':ended?(battle.status==='won'?'คุณเอาชนะมาดาระแล้ว':'ลองจัดการ MP แล้วกลับมาสู้ใหม่'):'รอคู่ต่อสู้เข้าสนาม';
  $('enemy-state').textContent=active?(battle.telegraphed?'ATTACK INCOMING':'IN COMBAT'):({idle:'READY TO FIGHT',paused:'PAUSED',won:'DEFEATED',lost:'VICTORIOUS'})[battle.status];
  $('battle-start').textContent=active?'⚔ กำลังต่อสู้':paused?'▶ สู้ต่อ':ended?'↻ เริ่มรอบใหม่':'⚔ เริ่มต่อสู้';
  $('battle-start').disabled=active||(!running&&!(paused&&demo));$('battle-pause').disabled=!active;$('battle-demo').disabled=active;
  $('preview-effect').disabled=active||paused;$('demo-controls').hidden=!demo;document.querySelector('.camera-panel').classList.toggle('battle-paused',paused);
  if(!stream)$('camera-label').textContent=demo?'DEMO / NO CAMERA':'CAMERA OFFLINE';
  for(const button of document.querySelectorAll('[data-skill]'))button.disabled=!active||battle.mp<SKILLS[button.dataset.skill].cost||battle.elapsed-battle.lastSkill<1.5;
  for(const button of document.querySelectorAll('[data-basic]'))button.disabled=!active;
  for(const card of document.querySelectorAll('[data-jutsu]'))card.classList.toggle('insufficient',active&&battle.mp<SKILLS[card.dataset.jutsu].cost);
  $('battle-result').hidden=!ended;
  if(ended){$('battle-result').classList.toggle('lost',battle.status==='lost');$('result-en').textContent=battle.status==='won'?'VICTORY':'DEFEAT';$('result-title').textContent=battle.status==='won'?'ชนะมาดาระ!':'ครั้งหน้าเอาใหม่';$('result-stats').textContent=`${demo?'DEMO · ':''}เวลา ${$('battle-time').textContent} · โจมตี ${battle.hits} ครั้ง · รวม ${battle.damage} ดาเมจ`;}
}
function startBattle(mode=battle.mode){
  void sound.unlock();
  if(mode==='camera'&&!running){notify('เปิดกล้องให้พร้อมก่อนเริ่มต่อสู้');return;}
  reset(false);motion.reset();
  if(battle.status==='paused'&&mode===battle.mode){battle.resume(performance.now());logCombat('กลับเข้าสู่การต่อสู้');}
  else{battle.start(performance.now(),mode);combatLog=[];logCombat(mode==='demo'?'เริ่ม DEMO — ใช้ปุ่มหรือ Z / X / 1 / 2 / 3':'เริ่มต่อสู้กับมาดาระ');}
  $('welcome').hidden=true;
  if(mode==='demo')$('stage-message').textContent='DEMO / BUTTONS INSTEAD OF CAMERA';
  notify(mode==='demo'?'ทดลองระบบ: กด Z ต่อย / X ฟาด / 1–3 ใช้วิชา (ไม่ต้องใช้กล้อง)':'ต่อสู้! มือเดียวต่อยหรือฟาด · สองมือประสานอินเพื่อใช้วิชา');renderBattle();
}
function pauseBattle(message='พักการต่อสู้แล้ว กดสู้ต่อเมื่อพร้อม'){
  if(!battle.pause())return;reset(false);motion.reset();notify(message);logCombat('พักการต่อสู้');renderBattle();
}
function hitEnemy(attack){
  if(!attack.ok)return false;const now=performance.now();arena.add(attack,now);
  logCombat(`${attack.name} −${attack.damage} HP${attack.type==='skill'?` · ใช้ ${attack.cost} MP`: ' · ไม่เสีย MP'}`);
  if(attack.won)notify('ชนะแล้ว! คุณเอาชนะมาดาระ กดสู้ใหม่เพื่อเริ่มอีกครั้ง');
  renderBattle();return true;
}
function basicAttack(kind){
  const attack=battle.basic(kind);if(!hitEnemy(attack))return;
  void sound.play(kind);
  if(!attack.won)notify((kind==='punch'?'✊ ต่อย':'✋ ฟาดหัว')+` โดนมาดาระ −${attack.damage} HP`);
  sequence=new SealSequence(selected.sequence);renderSeals();
}
$('battle-start').addEventListener('click',()=>startBattle(battle.status==='paused'?battle.mode:'camera'));
$('battle-pause').addEventListener('click',()=>pauseBattle());
$('battle-demo').addEventListener('click',()=>startBattle('demo'));
$('battle-retry').addEventListener('click',()=>startBattle(battle.mode));
$('demo-controls').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||battle.mode!=='demo'||battle.status!=='active')return;if(b.dataset.basic)basicAttack(b.dataset.basic);else if(b.dataset.skill)demoSkill(b.dataset.skill);});
function demoSkill(id){selected=JUTSUS.find(j=>j.id===id);reset(false);renderJutsus();cast(false,true);}
document.addEventListener('keydown',e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||battle.mode!=='demo'||battle.status!=='active'||$('guide').open||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;const key=e.key.toLowerCase();if(key==='z'||key==='x'){e.preventDefault();basicAttack(key==='z'?'punch':'slap');}if(['1','2','3'].includes(key)){e.preventDefault();demoSkill(JUTSUS[Number(key)-1].id);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){sound.stop();pauseBattle('พักอัตโนมัติเมื่อออกจากหน้าต่าง กดสู้ต่อเมื่อกลับมา');}});
function renderJutsus(){
  $('jutsu-list').innerHTML=JUTSUS.map((j,i)=>`<button class="jutsu-card ${selected.id===j.id?'active':''}" data-jutsu="${j.id}" aria-pressed="${selected.id===j.id}"><div class="card-top"><span class="jutsu-symbol">${j.symbol}</span><span class="jutsu-number">0${i+1} ${selected.id===j.id?'↗':''}</span></div><h3>${j.name}</h3><span class="english">${j.en}</span><p>${j.description}</p><div class="card-sequence">${j.sequence.map(s=>SEALS[s].name).join('<i>→</i>')}</div><div class="skill-price"><b>${SKILLS[j.id].cost} MP</b><span>−${SKILLS[j.id].damage} HP${j.id==='clone'?' + ป้องกัน':''}</span></div></button>`).join('');
}
function renderSeals(){
  $('sequence-counter').textContent=`${Math.min(3,sequence.index)} / 3`;
  $('seal-list').innerHTML=selected.sequence.map((id,i)=>`<div class="seal-row ${i===sequence.index?'current':''} ${i<sequence.index?'complete':''}"><span class="seal-step">${i<sequence.index?'✓':i+1}</span>${sealArt(id)}<div class="seal-info"><h3>${SEALS[id].name}</h3><small>${SEALS[id].en}</small><p>${SEALS[id].instruction}</p><button class="learn-button" data-learn="${id}" title="จดจำท่ามือของคุณ">${templates[id]?'✓ ฝึกแล้ว · ฝึกใหม่':'＋ ฝึกท่านี้'}</button></div></div>`).join('');
}
function reset(message=true){sound.stop();castGeneration++;sequence=new SealSequence(selected.sequence);effects.clear();calibration=null;$('cast-banner').hidden=true;$('welcome').hidden=!!stream||(battle.mode==='demo'&&battle.status!=='idle');renderSeals();if(message)notify('เริ่มอินใหม่: '+selected.sequence.map(s=>SEALS[s].name).join(' → '));}
$('jutsu-list').addEventListener('click',e=>{const b=e.target.closest('[data-jutsu]');if(!b)return;selected=JUTSUS.find(j=>j.id===b.dataset.jutsu);reset();renderJutsus();});
$('seal-list').addEventListener('click',e=>{const b=e.target.closest('[data-learn]');if(!b)return;if(!running){notify('เปิดกล้องก่อน แล้วค่อยฝึกท่ามือของคุณ');return;}pauseBattle();calibration={id:b.dataset.learn,until:performance.now()+3000,samples:[]};effects.clear();notify('ทำท่า '+SEALS[calibration.id].name+' ให้เห็นทั้งสองมือ แล้วค้างไว้ 3 วินาที…');});
$('threshold').addEventListener('input',e=>{$('threshold-label').value=e.target.value+'%';sequence.candidate=null;});
$('reset').addEventListener('click',()=>reset());
$('guide-open').addEventListener('click',()=>{pauseBattle();$('guide').showModal();});
$('guide-close').addEventListener('click',()=>$('guide').close());
$('clear-templates').addEventListener('click',()=>{templates={};try{localStorage.removeItem('ninja-seal-templates-v1');}catch{}reset(false);$('guide').close();notify('ล้างท่าที่ฝึกไว้แล้ว ใช้รูปแบบท่ามาตรฐาน');});
$('guide').addEventListener('click',e=>{if(e.target===$('guide')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('main').requestFullscreen();}catch{notify('เบราว์เซอร์นี้ไม่รองรับเต็มจอ');}});
async function loadModels(){
  if(models)return models;if(modelPromise)return modelPromise;
  modelPromise=(async()=>{
    const {FilesetResolver,HandLandmarker,FaceLandmarker,ImageSegmenter}=await import('./vendor/vision_bundle.mjs');
    const fs=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',import.meta.url).href);
    const created=[];
    const make=async(Type,file,opts)=>{let task;try{task=await Type.createFromOptions(fs,{baseOptions:{modelAssetPath:new URL('./models/'+file,import.meta.url).href,delegate:'GPU'},...opts});}catch{task=await Type.createFromOptions(fs,{baseOptions:{modelAssetPath:new URL('./models/'+file,import.meta.url).href,delegate:'CPU'},...opts});}created.push(task);return task;};
    try{
      const hand=await make(HandLandmarker,'hand_landmarker.task',{runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.35,minHandPresenceConfidence:.35,minTrackingConfidence:.35});
      const face=await make(FaceLandmarker,'face_landmarker.task',{runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.4,minFacePresenceConfidence:.4,minTrackingConfidence:.4});
      const segment=await make(ImageSegmenter,'selfie_segmenter.tflite',{runningMode:'IMAGE',outputCategoryMask:false,outputConfidenceMasks:true});
      return models={hand,face,segment};
    }catch(e){created.forEach(t=>t.close());throw e;}
  })();
  try{return await modelPromise;}finally{modelPromise=null;}
}
async function startCamera(){
  void sound.unlock();
  if(loading||running)return;const ownSession=++session;loading=true;
  const button=$('camera-start');button.disabled=true;button.textContent='กำลังเปิดกล้อง…';$('camera-stop').disabled=false;
  notify('กำลังขอใช้กล้องและโหลดระบบตรวจมือกับใบหน้า ครั้งแรกอาจใช้เวลาสักครู่');
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('SECURE_CONTEXT');
    const next=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:960},height:{ideal:720},facingMode:'user'},audio:false});
    if(ownSession!==session){next.getTracks().forEach(t=>t.stop());return;}
    stream=next;video.srcObject=stream;await video.play();
    if(ownSession!==session)return;
    canvas.width=video.videoWidth||960;canvas.height=video.videoHeight||720;
    $('welcome').hidden=true;$('camera-label').textContent='CAMERA LIVE';$('live-dot').classList.add('on');
    button.textContent='กำลังโหลดระบบตรวจท่า…';notify('เปิดกล้องแล้ว กำลังเตรียม AI ตรวจมือ ใบหน้า และแยกภาพคน…');
    await loadModels();if(ownSession!==session)return;
    running=true;lastVideoTime=-1;inferenceErrors=0;
    stream.getVideoTracks()[0].addEventListener('ended',()=>{if(running){stopCamera();notify('กล้องถูกตัดการเชื่อมต่อ เปิดกล้องเพื่อเริ่มใหม่',true);}});
    notify('กล้องพร้อมแล้ว กดเริ่มต่อสู้ · มือเดียวต่อยหรือฟาด / สองมือประสานอิน');renderBattle();
  }catch(e){
    if(ownSession!==session)return;
    stopCamera();
    const messages={NotAllowedError:'ยังไม่ได้รับอนุญาตใช้กล้อง เปิดสิทธิ์กล้องในเบราว์เซอร์แล้วลองใหม่',NotFoundError:'ไม่พบกล้อง เชื่อมต่อเว็บแคมแล้วลองใหม่',NotReadableError:'เปิดกล้องไม่ได้ กล้องอาจถูกใช้งานโดยแอปอื่น',SECURE_CONTEXT:'กล้องต้องเปิดผ่าน HTTPS หรือ localhost กรุณาใช้ลิงก์เกมหรือเซิร์ฟเวอร์ในเครื่อง'};
    notify(messages[e.name]||messages[e.message]||'โหลดระบบตรวจท่าไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วกดเปิดกล้องอีกครั้ง',true);console.error('Camera/model initialization failed:',e);
  }finally{if(ownSession===session)loading=false;if(ownSession===session||!loading){button.disabled=false;button.innerHTML='<span>◉</span> เปิดกล้อง <span>↗</span>';}}
}
function stopCamera(){
  if(battle.mode==='camera')pauseBattle('กล้องปิดแล้ว พักการต่อสู้ไว้ เปิดกล้องแล้วกดสู้ต่อ');
  session++;loading=false;running=false;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;
  hands=[];face=null;reset(false);$('welcome').hidden=false;$('camera-label').textContent='CAMERA OFFLINE';$('live-dot').classList.remove('on');$('camera-stop').disabled=true;
  $('camera-start').disabled=false;$('camera-start').innerHTML='<span>◉</span> เปิดกล้อง <span>↗</span>';
  updateTracking();renderBattle();$('stage-message').textContent='AWAITING YOUR CHAKRA';notify('ปิดกล้องแล้ว เปิดกล้องอีกครั้งเพื่อฝึกต่อ');
}
$('camera-start').addEventListener('click',startCamera);$('camera-stop').addEventListener('click',stopCamera);
function updateTracking(){
  $('hand-count').textContent=hands.length;$('hand-dot').classList.toggle('on',hands.length===2||(battle.status==='active'&&hands.length>0));
  $('face-state').textContent=face?'พบใบหน้า':'รอใบหน้า';$('face-dot').classList.toggle('on',!!face);
  if(!running){$('detected-name').textContent='—';$('similarity').textContent='0%';$('match-meter').style.width='0%';}
}
async function snapshotClone(){
  const shot=document.createElement('canvas');shot.width=video.videoWidth;shot.height=video.videoHeight;
  const c=shot.getContext('2d');c.drawImage(video,0,0);
  // Segment the exact frozen frame, rather than a different later video frame.
  models.segment.segment(shot,result=>{
    const mask=result.confidenceMasks?.[0];if(!mask)throw Error('No person mask returned');
    const maskCanvas=document.createElement('canvas');maskCanvas.width=mask.width;maskCanvas.height=mask.height;
    const mc=maskCanvas.getContext('2d'),pixels=mc.createImageData(mask.width,mask.height), values=mask.getAsFloat32Array();
    for(let i=0;i<values.length;i++){pixels.data[i*4]=255;pixels.data[i*4+1]=255;pixels.data[i*4+2]=255;pixels.data[i*4+3]=Math.max(0,Math.min(1,(values[i]-.25)/.5))*255;}
    mc.putImageData(pixels,0,0);c.globalCompositeOperation='destination-in';c.drawImage(maskCanvas,0,0,shot.width,shot.height);c.globalCompositeOperation='source-over';
  });
  const mirrored=document.createElement('canvas');mirrored.width=shot.width;mirrored.height=shot.height;const m=mirrored.getContext('2d');m.translate(shot.width,0);m.scale(-1,1);m.drawImage(shot,0,0);return mirrored;
}
let castGeneration=0;
async function cast(demo=false,battleDemo=false){
  if(!demo){
    if(battle.status==='paused'||['won','lost'].includes(battle.status)){sequence=new SealSequence(selected.sequence);renderSeals();notify('กดสู้ต่อหรือเริ่มรอบใหม่ก่อนใช้วิชา');return;}
    if(battle.status==='active'){
      const attack=battle.useSkill(selected.id);
      if(!attack.ok){sequence=new SealSequence(selected.sequence);renderSeals();notify(attack.reason==='mp'?`MP ไม่พอ ต้องใช้ ${attack.cost} MP · รอฟื้นหรือต่อยแทน`:'รอวิชาพร้อมอีกสักครู่',true);return;}
      hitEnemy(attack);
    }
  }
  const generation=++castGeneration;
  effects.start(selected.id,performance.now(),demo||battleDemo,battle.status==='active'||battle.status==='won'?2.8:6);const jutsu=selected;
  void sound.play(jutsu.id);
  if(demo&&!stream){$('welcome').hidden=true;$('stage-message').textContent='EFFECT PREVIEW · DEMO AVATAR';}
  $('cast-banner').innerHTML=`<small>${demo?'EFFECT PREVIEW':'JUTSU ACTIVATED'}</small><strong>${jutsu.name}</strong><em>${jutsu.en}</em>`;$('cast-banner').hidden=false;
  if(!demo){count++;$('cast-count').textContent=String(count).padStart(2,'0');if(battle.status!=='won')notify('สำเร็จ! '+jutsu.name+(battle.status==='active'?` · ใช้ ${SKILLS[jutsu.id].cost} MP · มาดาระ −${SKILLS[jutsu.id].damage} HP`:' · ทดลองวิชานอก Battle'));}
  else notify('ตัวอย่าง '+jutsu.name+' · ไม่เพิ่มคะแนนและไม่ผ่านลำดับอิน'+(!running?' · เปิดกล้องเพื่อใช้กับภาพของคุณ':''));
  if(jutsu.id==='clone'&&video.readyState>=2&&models){try{const shot=await snapshotClone();if(generation===castGeneration&&effects.active==='clone')effects.clones=shot;}catch(e){notify('แยกร่างไม่สำเร็จ โปรดลองใหม่โดยให้เห็นตัวในกล้อง',true);effects.clear();console.error(e);}}
}
$('preview-effect').addEventListener('click',()=>{if(['active','paused'].includes(battle.status))return;sequence=new SealSequence(selected.sequence);renderSeals();cast(true);});
function detect(now){
  try{
    hands=models.hand.detectForVideo(video,now).landmarks;face=models.face.detectForVideo(video,now).faceLandmarks[0]||null;inferenceErrors=0;
  }catch(e){if(++inferenceErrors===3){stopCamera();notify('ระบบติดตามหยุดทำงาน กดเปิดกล้องเพื่อลองใหม่',true);console.error(e);}return;}
  updateTracking();const result=classify(hands,templates), threshold=Number($('threshold').value)/100;
  const candidate=result.id&&result.score>=threshold?result.id:null;
  $('detected-name').textContent=candidate?SEALS[candidate].name:'—';$('similarity').textContent=hands.length===2?Math.round(result.score*100)+'%':'0%';
  $('match-meter').style.width=(hands.length===2?result.score*100:0)+'%';
  const singleHandCombat=battle.status==='active'&&battle.mode==='camera'&&hands.length===1;
  $('detection-hint').textContent=singleHandCombat?'มือเดียว: กำหมัดต่อย หรือแบมือฟาดลง':hands.length<2?'ให้เห็นมือทั้งสองข้างเพื่อประสานอิน':candidate?'ตรวจพบ '+SEALS[candidate].name+' · ค้างท่านี้ไว้':'ท่ายังไม่ชัด ลองขยับมือหรือฝึกท่านี้';
  $('stage-message').textContent=singleHandCombat?'TAIJUTSU READY · MOVE TO STRIKE':hands.length===2?'CHAKRA CONNECTED · HOLD YOUR SEAL':'SHOW YOUR HANDS TO THE CAMERA';
  if(calibration){
    if(result.features)calibration.samples.push(result.features);
    if(now>=calibration.until){
      const saved=calibration;calibration=null;
      if(saved.samples.length<8){notify('ยังเห็นมือไม่ชัดพอ ลองฝึกท่านี้ใหม่โดยแยกมือเล็กน้อย',true);return;}
      const average=k=>saved.samples.reduce((s,f)=>s+f[k],0)/saved.samples.length;
      templates[saved.id]={fingers:[0,1].map(i=>[0,1,2,3].map(j=>saved.samples.reduce((s,f)=>s+f.fingers[i][j],0)/saved.samples.length)),contact:average('contact'),tipContact:average('tipContact'),cross:average('cross')};
      try{localStorage.setItem('ninja-seal-templates-v1',JSON.stringify(templates));}catch{}
      sequence=new SealSequence(selected.sequence);renderSeals();notify('จดจำท่า '+SEALS[saved.id].name+' แล้ว เริ่มประสานอินตามลำดับได้เลย');
    }return;
  }
  if(battle.status==='active'&&battle.mode==='camera'){
    const gesture=motion.update(hands,now);
    if(gesture&&!effects.active&&(hands.length===1||(!candidate&&sequence.index===0))){basicAttack(gesture.kind);return;}
  }else motion.reset();
  if(battle.status!=='idle'&&(battle.status!=='active'||battle.mode==='demo'))return;
  if(effects.active)return;
  const event=sequence.update(candidate,now);if(!event)return;
  renderSeals();
  if(event.type==='cast')cast();
  if(event.type==='accepted')notify('✓ '+SEALS[event.id].name+' · ต่อไป '+SEALS[selected.sequence[event.index]].name);
  if(event.type==='wrong')notify('ลำดับยังไม่ถูก เริ่มจาก '+SEALS[selected.sequence[0]].name+' แล้วทำตามทางขวา');
  if(event.type==='timeout')notify('หมดเวลาระหว่างอิน เริ่มลำดับใหม่ได้เลย');
}
function frame(now){
  for(const event of battle.tick(now)){
    if(event.type==='enemy-hit'){void sound.play('punch',{volume:.55});arena.add(event,now);hitFlashUntil=now+450;logCombat(`มาดาระ${event.strong?'ใช้หมัดหนัก':'โจมตี'} −${event.damage} HP${event.shielded?' · แยกร่างลดดาเมจ':''}`,true);}
    if(event.type==='lost'){sequence=new SealSequence(selected.sequence);renderSeals();notify('HP หมดแล้ว มาดาระชนะรอบนี้ กดสู้ใหม่เพื่อลองอีกครั้ง');}
  }
  if(running&&video.readyState>=2&&now-lastInference>100&&video.currentTime!==lastVideoTime){lastInference=now;lastVideoTime=video.currentTime;detect(now);}
  const wasActive=!!effects.active;effects.draw(video,face,hands,now);
  if(battle.mode==='demo'&&battle.status!=='idle'&&!stream&&!effects.active){effects.drawDemo(canvas.width,canvas.height);$('welcome').hidden=true;}
  if(wasActive&&!effects.active){$('cast-banner').hidden=true;if(!stream&&battle.mode!=='demo'){$('welcome').hidden=false;$('stage-message').textContent='AWAITING YOUR CHAKRA';}sequence=new SealSequence(selected.sequence);renderSeals();}
  arena.draw(battle,now);$('damage-flash').classList.toggle('on',now<hitFlashUntil);
  if(now-lastHud>100){lastHud=now;renderBattle();}
  requestAnimationFrame(frame);
}
window.addEventListener('pagehide',()=>{sound.stop();stream?.getTracks().forEach(t=>t.stop());Object.values(models||{}).forEach(m=>m.close());});
renderJutsus();renderSeals();renderBattle();requestAnimationFrame(frame);
