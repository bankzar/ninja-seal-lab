import {SEALS,JUTSUS,SealSequence,classify,sealArt} from './seals.js';
import {Effects} from './effects.js';
const $=id=>document.getElementById(id);
const video=$('video'), canvas=$('scene'), effects=new Effects(canvas);
canvas.width=960;canvas.height=720;
let selected=JUTSUS[0], sequence=new SealSequence(selected.sequence), models=null, modelPromise=null;
let stream=null, running=false, loading=false, session=0, lastVideoTime=-1, lastInference=0, face=null, hands=[], count=0;
let calibration=null, templates={}, inferenceErrors=0;
try{const saved=JSON.parse(localStorage.getItem('ninja-seal-templates-v1')||'{}');for(const id of Object.keys(SEALS)){const t=saved[id];if(t&&Array.isArray(t.fingers)&&t.fingers.length===2&&t.fingers.every(a=>Array.isArray(a)&&a.length===4&&a.every(Number.isFinite))&&['contact','cross','tipContact'].every(k=>Number.isFinite(t[k])))templates[id]=t;}}catch{}
function notify(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function renderJutsus(){
  $('jutsu-list').innerHTML=JUTSUS.map((j,i)=>`<button class="jutsu-card ${selected.id===j.id?'active':''}" data-jutsu="${j.id}" aria-pressed="${selected.id===j.id}"><div class="card-top"><span class="jutsu-symbol">${j.symbol}</span><span class="jutsu-number">0${i+1} ${selected.id===j.id?'↗':''}</span></div><h3>${j.name}</h3><span class="english">${j.en}</span><p>${j.description}</p><div class="card-sequence">${j.sequence.map(s=>SEALS[s].name).join('<i>→</i>')}</div></button>`).join('');
}
function renderSeals(){
  $('sequence-counter').textContent=`${Math.min(3,sequence.index)} / 3`;
  $('seal-list').innerHTML=selected.sequence.map((id,i)=>`<div class="seal-row ${i===sequence.index?'current':''} ${i<sequence.index?'complete':''}"><span class="seal-step">${i<sequence.index?'✓':i+1}</span>${sealArt(id)}<div class="seal-info"><h3>${SEALS[id].name}</h3><small>${SEALS[id].en}</small><p>${SEALS[id].instruction}</p><button class="learn-button" data-learn="${id}" title="จดจำท่ามือของคุณ">${templates[id]?'✓ ฝึกแล้ว · ฝึกใหม่':'＋ ฝึกท่านี้'}</button></div></div>`).join('');
}
function reset(message=true){castGeneration++;sequence=new SealSequence(selected.sequence);effects.clear();calibration=null;$('cast-banner').hidden=true;$('welcome').hidden=!!stream;renderSeals();if(message)notify('เริ่มลำดับใหม่: '+selected.sequence.map(s=>SEALS[s].name).join(' → '));}
$('jutsu-list').addEventListener('click',e=>{const b=e.target.closest('[data-jutsu]');if(!b)return;selected=JUTSUS.find(j=>j.id===b.dataset.jutsu);reset();renderJutsus();});
$('seal-list').addEventListener('click',e=>{const b=e.target.closest('[data-learn]');if(!b)return;if(!running){notify('เปิดกล้องก่อน แล้วค่อยฝึกท่ามือของคุณ');return;}calibration={id:b.dataset.learn,until:performance.now()+3000,samples:[]};effects.clear();notify('ทำท่า '+SEALS[calibration.id].name+' ให้เห็นทั้งสองมือ แล้วค้างไว้ 3 วินาที…');});
$('threshold').addEventListener('input',e=>{$('threshold-label').value=e.target.value+'%';sequence.candidate=null;});
$('reset').addEventListener('click',()=>reset());
$('guide-open').addEventListener('click',()=>$('guide').showModal());
$('guide-close').addEventListener('click',()=>$('guide').close());
$('clear-templates').addEventListener('click',()=>{templates={};try{localStorage.removeItem('ninja-seal-templates-v1');}catch{}reset(false);$('guide').close();notify('ล้างท่าที่ฝึกไว้แล้ว ใช้รูปแบบท่ามาตรฐาน');});
$('guide').addEventListener('click',e=>{if(e.target===$('guide')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('stage').requestFullscreen();}catch{notify('เบราว์เซอร์นี้ไม่รองรับเต็มจอ');}});
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
    notify('พร้อมแล้ว! '+selected.sequence.map(s=>SEALS[s].name).join(' → ')+' · ค้างแต่ละอินประมาณ 0.6 วินาที');
  }catch(e){
    if(ownSession!==session)return;
    stopCamera();
    const messages={NotAllowedError:'ยังไม่ได้รับอนุญาตใช้กล้อง เปิดสิทธิ์กล้องในเบราว์เซอร์แล้วลองใหม่',NotFoundError:'ไม่พบกล้อง เชื่อมต่อเว็บแคมแล้วลองใหม่',NotReadableError:'เปิดกล้องไม่ได้ กล้องอาจถูกใช้งานโดยแอปอื่น',SECURE_CONTEXT:'กล้องต้องเปิดผ่าน HTTPS หรือ localhost กรุณาใช้ลิงก์เกมหรือเซิร์ฟเวอร์ในเครื่อง'};
    notify(messages[e.name]||messages[e.message]||'โหลดระบบตรวจท่าไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วกดเปิดกล้องอีกครั้ง',true);console.error('Camera/model initialization failed:',e);
  }finally{if(ownSession===session)loading=false;button.disabled=false;button.innerHTML='<span>◉</span> เปิดกล้อง เริ่มฝึก <span>↗</span>';}
}
function stopCamera(){
  session++;loading=false;running=false;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;
  hands=[];face=null;reset(false);$('welcome').hidden=false;$('camera-label').textContent='CAMERA OFFLINE';$('live-dot').classList.remove('on');$('camera-stop').disabled=true;
  $('camera-start').disabled=false;$('camera-start').innerHTML='<span>◉</span> เปิดกล้อง เริ่มฝึก <span>↗</span>';
  updateTracking();$('stage-message').textContent='AWAITING YOUR CHAKRA';notify('ปิดกล้องแล้ว เปิดกล้องอีกครั้งเพื่อฝึกต่อ');
}
$('camera-start').addEventListener('click',startCamera);$('camera-stop').addEventListener('click',stopCamera);
function updateTracking(){
  $('hand-count').textContent=hands.length;$('hand-dot').classList.toggle('on',hands.length===2);
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
async function cast(demo=false){
  const generation=++castGeneration;
  effects.start(selected.id,performance.now(),demo);const jutsu=selected;
  if(demo&&!stream){$('welcome').hidden=true;$('stage-message').textContent='EFFECT PREVIEW · DEMO AVATAR';}
  $('cast-banner').innerHTML=`<small>${demo?'EFFECT PREVIEW':'JUTSU ACTIVATED'}</small><strong>${jutsu.name}</strong><em>${jutsu.en}</em>`;$('cast-banner').hidden=false;
  if(!demo){count++;$('cast-count').textContent=String(count).padStart(2,'0');notify('สำเร็จ! '+jutsu.name+' · เอฟเฟกต์ทำงาน 6 วินาที');}
  else notify('ตัวอย่าง '+jutsu.name+' · ไม่เพิ่มคะแนนและไม่ผ่านลำดับอิน'+(!running?' · เปิดกล้องเพื่อใช้กับภาพของคุณ':''));
  if(jutsu.id==='clone'&&video.readyState>=2&&models){try{const shot=await snapshotClone();if(generation===castGeneration&&effects.active==='clone')effects.clones=shot;}catch(e){notify('แยกร่างไม่สำเร็จ โปรดลองใหม่โดยให้เห็นตัวในกล้อง',true);effects.clear();console.error(e);}}
}
$('preview-effect').addEventListener('click',()=>{sequence=new SealSequence(selected.sequence);renderSeals();cast(true);});
function detect(now){
  try{
    hands=models.hand.detectForVideo(video,now).landmarks;face=models.face.detectForVideo(video,now).faceLandmarks[0]||null;inferenceErrors=0;
  }catch(e){if(++inferenceErrors===3){stopCamera();notify('ระบบติดตามหยุดทำงาน กดเปิดกล้องเพื่อลองใหม่',true);console.error(e);}return;}
  updateTracking();const result=classify(hands,templates), threshold=Number($('threshold').value)/100;
  const candidate=result.id&&result.score>=threshold?result.id:null;
  $('detected-name').textContent=candidate?SEALS[candidate].name:'—';$('similarity').textContent=hands.length===2?Math.round(result.score*100)+'%':'0%';
  $('match-meter').style.width=(hands.length===2?result.score*100:0)+'%';
  $('detection-hint').textContent=hands.length<2?'ให้เห็นมือทั้งสองข้าง ลองแยกมือเล็กน้อย':candidate?'ตรวจพบ '+SEALS[candidate].name+' · ค้างท่านี้ไว้':'ท่ายังไม่ชัด ลองขยับมือหรือฝึกท่านี้';
  $('stage-message').textContent=hands.length===2?'CHAKRA CONNECTED · HOLD YOUR SEAL':'SHOW BOTH HANDS TO THE CAMERA';
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
  if(effects.active)return;
  const event=sequence.update(candidate,now);if(!event)return;
  renderSeals();
  if(event.type==='cast')cast();
  if(event.type==='accepted')notify('✓ '+SEALS[event.id].name+' · ต่อไป '+SEALS[selected.sequence[event.index]].name);
  if(event.type==='wrong')notify('ลำดับยังไม่ถูก เริ่มจาก '+SEALS[selected.sequence[0]].name+' แล้วทำตามทางขวา');
  if(event.type==='timeout')notify('หมดเวลาระหว่างอิน เริ่มลำดับใหม่ได้เลย');
}
function frame(now){
  if(running&&video.readyState>=2&&now-lastInference>100&&video.currentTime!==lastVideoTime){lastInference=now;lastVideoTime=video.currentTime;detect(now);}
  const wasActive=!!effects.active;effects.draw(video,face,hands,now);
  if(wasActive&&!effects.active){$('cast-banner').hidden=true;if(!stream){$('welcome').hidden=false;$('stage-message').textContent='AWAITING YOUR CHAKRA';}sequence=new SealSequence(selected.sequence);renderSeals();}
  requestAnimationFrame(frame);
}
window.addEventListener('pagehide',()=>{stream?.getTracks().forEach(t=>t.stop());Object.values(models||{}).forEach(m=>m.close());});
renderJutsus();renderSeals();requestAnimationFrame(frame);
