export const SEALS = {
  rat: { name: 'ชวด', en: 'RAT / NE', instruction: 'ชูนิ้วชี้–กลาง มืออีกข้างกำไว้' },
  ox: { name: 'ฉลู', en: 'OX / USHI', instruction: 'ชูชี้–ก้อย ไขว้มือเป็นเขา' },
  bird: { name: 'ระกา', en: 'BIRD / TORI', instruction: 'กางนิ้ว ประกบปลายนิ้วสองมือ' },
};
export const JUTSUS = [
  { id:'fire', name:'เนตรวงแหวน', en:'SHARINGAN · FIRE RELEASE', symbol:'写', description:'ปลุกเนตรสีแดง พร้อมเปลวไฟ', sequence:['ox','bird','rat'], color:'#f18d51' },
  { id:'clone', name:'คาถาแยกร่าง', en:'SHADOW CLONE JUTSU', symbol:'分', description:'หนึ่งตัวตน ห้าร่างในพริบตา', sequence:['bird','rat','ox'], color:'#b4c98d' },
  { id:'lightning', name:'พันปักษา', en:'CHIDORI · LIGHTNING RELEASE', symbol:'雷', description:'รวมจักระสายฟ้าไว้ในฝ่ามือ', sequence:['rat','ox','bird'], color:'#88d8ff' },
];
const clamp = x => Math.max(0,Math.min(1,x));
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
function extension(h, start) {
  const a=h[start], b=h[start+1], c=h[start+3];
  const u=[a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0)], v=[c.x-b.x,c.y-b.y,(c.z||0)-(b.z||0)];
  const cosine=u.reduce((s,x,i)=>s+x*v[i],0)/(Math.hypot(...u)*Math.hypot(...v)||1);
  const angle=clamp((-cosine-.05)/.85);
  const reach=clamp((dist(c,h[0])/(dist(b,h[0])||.01)-.78)/.55);
  return angle*.7+reach*.3;
}
export function handFeatures(hands) {
  if(!hands || hands.length!==2 || hands.some(h=>h.length<21)) return null;
  const fingers=hands.map(h=>[5,9,13,17].map(i=>extension(h,i)));
  const scale=(dist(hands[0][0],hands[0][9])+dist(hands[1][0],hands[1][9]))/2||.1;
  const contact=clamp(1-dist(hands[0][9],hands[1][9])/(scale*3));
  const tipContact=clamp(1-dist(hands[0][12],hands[1][12])/(scale*2.5));
  const dirs=hands.map(h=>Math.atan2(h[9].y-h[0].y,h[9].x-h[0].x));
  const cross=Math.abs(Math.sin(dirs[0]-dirs[1]));
  return { fingers, contact, tipContact, cross };
}
const similarity=(a,b)=>1-a.reduce((s,x,i)=>s+Math.abs(x-b[i]),0)/a.length;
function paired(f, a, b){return Math.max((similarity(f[0],a)+similarity(f[1],b))/2,(similarity(f[1],a)+similarity(f[0],b))/2);}
export function classify(hands, templates={}) {
  const f=handFeatures(hands);
  if(!f)return {id:null,score:0,scores:{},features:null};
  // Compare all seals without knowledge of the requested next seal.
  const curlContrast=Math.max(...f.fingers.flat())-Math.min(...f.fingers.flat());
  const scores={
    rat:paired(f.fingers,[1,1,0,0],[0,0,0,0])*.85+f.contact*.15,
    ox:paired(f.fingers,[1,0,0,1],[1,0,0,1])*.75+f.cross*.15+f.contact*.1,
    bird:paired(f.fingers,[1,1,1,1],[1,1,1,1])*.65+f.tipContact*.25+f.contact*.1,
  };
  // Learned templates preserve handedness invariance and are stored on this device.
  for(const [id,t] of Object.entries(templates)){
    if(!(id in scores)||!t?.fingers)continue;
    scores[id]=paired(f.fingers,...t.fingers)*.7+(1-Math.abs(f.contact-t.contact))*.1+(1-Math.abs(f.cross-t.cross))*.1+(1-Math.abs(f.tipContact-t.tipContact))*.1;
  }
  const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  const [id,score]=ranked[0];
  // Distant hands, generic closed fists, and ambiguous poses never advance a sequence.
  const plausible=f.contact>.12 && (id==='bird'?f.tipContact>.2:curlContrast>.22);
  return {id:plausible&&score-ranked[1][1]>.045?id:null,score,scores,features:f};
}
export class SealSequence {
  constructor(sequence, dwell=600, timeout=12000){this.sequence=sequence;this.dwell=dwell;this.timeout=timeout;this.reset();}
  reset(){this.index=0;this.candidate=null;this.since=0;this.lastAccepted=null;this.lastAt=0;this.latched=false;}
  update(id,now){
    if(this.index && now-this.lastAt>this.timeout){this.reset();return {type:'timeout'};}
    if(id!==this.lastAccepted)this.latched=false;
    if(!id){this.candidate=null;return null;}
    if(this.latched)return null;
    if(id!==this.candidate){this.candidate=id;this.since=now;return null;}
    if(now-this.since<this.dwell)return null;
    this.latched=true;this.lastAccepted=id;this.lastAt=now;this.candidate=null;
    if(id!==this.sequence[this.index]){
      this.index=id===this.sequence[0]?1:0;
      return {type:'wrong',index:this.index,id};
    }
    this.index++;
    return {type:this.index===this.sequence.length?'cast':'accepted',index:this.index,id};
  }
}
export function sealArt(id){
 const base='<svg class="seal-art" viewBox="0 0 100 90" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
 const art={
 rat:'<path d="M27 83 25 66 21 53Q19 46 24 44Q28 42 32 51L35 57 34 21Q34 14 39 14Q44 14 44 21L45 45 47 16Q48 9 53 10Q58 10 57 18L57 47Q70 43 75 51L78 65 70 84"/><path d="M36 60 59 56Q68 55 69 61Q69 65 59 66L42 69M35 69 57 68Q65 68 65 73Q64 78 44 79M45 45 47 54M57 47 57 55M28 83 43 80"/>',
 ox:'<path d="M16 79 25 58 20 28Q19 21 24 20Q29 20 30 27L36 44 53 43 67 22Q71 16 75 19Q80 22 76 28L66 47 74 55 79 76M27 58 38 52 55 56Q62 58 59 63Q57 68 48 64L38 62M31 72 44 68 59 71"/><path d="M84 78 74 58 80 31Q82 24 77 23M64 48 53 32Q49 27 45 30Q42 33 46 38L53 47M24 60 36 70 50 75 66 70 75 63M36 44 44 50M44 43 48 50"/>',
 bird:'<path d="M17 82 21 64 14 43Q12 36 17 34Q22 32 25 39L32 53 25 27Q23 21 28 19Q33 17 35 24L43 45 38 17Q37 10 42 10Q47 10 48 17L50 44M83 82 79 64 86 43Q88 36 83 34Q78 32 75 39L68 53 75 27Q77 21 72 19Q67 17 65 24L57 45 62 17Q63 10 58 10Q53 10 52 17L50 44"/><path d="M32 53 42 59 50 48 58 59 68 53M21 64 36 71 50 63 64 71 79 64M36 71 39 83M64 71 61 83M43 45 50 48 57 45"/>',
 };return base+art[id]+'</svg>';
}
