export const SKILLS = Object.freeze({
  fire: { cost:35, damage:64, name:'เนตรวงแหวน · เพลิง' },
  clone: { cost:25, damage:38, name:'แยกร่าง', shieldSeconds:6 },
  lightning: { cost:30, damage:58, name:'พันปักษา' },
});
export const BASIC = Object.freeze({ punch:{damage:8,name:'หมัด'}, slap:{damage:11,name:'ฟาดมือ'} });

// All combat time is active time. Pauses never bank regeneration or enemy attacks.
export class Battle {
  constructor(){this.reset();}
  reset(){Object.assign(this,{status:'idle',mode:'camera',hp:100,mp:100,enemyHp:360,elapsed:0,regen:0,shieldUntil:0,nextAttack:4.5,attackNumber:0,telegraphed:false,lastBasic:-Infinity,lastSkill:-Infinity,lastNow:null,hits:0,damage:0});}
  start(now,mode='camera'){this.reset();this.status='active';this.mode=mode;this.lastNow=now;return {type:'start'};}
  pause(){if(this.status==='active'){this.status='paused';this.lastNow=null;return true;}return false;}
  resume(now){if(this.status==='paused'){this.status='active';this.lastNow=now;return true;}return false;}
  tick(now){
    if(this.status!=='active')return [];
    const dt=Math.max(0,(now-this.lastNow)/1000);this.lastNow=now;this.elapsed+=dt;this.regen+=dt;
    const seconds=Math.floor(this.regen);this.regen-=seconds;this.mp=Math.min(100,this.mp+seconds*5);
    const events=[];
    if(this.elapsed>=this.nextAttack){
      this.attackNumber++;const strong=this.attackNumber%3===0;
      const amount=Math.round((strong?17:11)*(this.elapsed < this.shieldUntil ? 0.5 : 1));
      this.hp=Math.max(0,this.hp-amount);events.push({type:'enemy-hit',damage:amount,strong,shielded:this.elapsed<this.shieldUntil});
      this.nextAttack=this.elapsed+4.5;this.telegraphed=false;
      if(this.hp===0){this.status='lost';events.push({type:'lost'});}
    }else if(!this.telegraphed&&this.nextAttack-this.elapsed<=1.3){this.telegraphed=true;events.push({type:'warning',strong:(this.attackNumber+1)%3===0});}
    return events;
  }
  basic(kind){
    if(this.status!=='active')return {ok:false,reason:'inactive'};
    if(!(kind in BASIC))return {ok:false,reason:'unknown'};
    if(this.elapsed-this.lastBasic<.65)return {ok:false,reason:'cooldown'};
    this.lastBasic=this.elapsed;return this.hit({type:'basic',id:kind,...BASIC[kind]});
  }
  useSkill(id){
    if(this.status!=='active')return {ok:false,reason:'inactive'};
    const skill=SKILLS[id];if(!skill)return {ok:false,reason:'unknown'};
    if(this.mp<skill.cost)return {ok:false,reason:'mp',cost:skill.cost};
    if(this.elapsed-this.lastSkill<1.5)return {ok:false,reason:'cooldown'};
    this.mp-=skill.cost;this.lastSkill=this.elapsed;
    if(skill.shieldSeconds)this.shieldUntil=this.elapsed+skill.shieldSeconds;
    // A successful jutsu interrupts Madara's windup, basic strikes do not.
    this.nextAttack=this.elapsed+4.5;this.telegraphed=false;
    return this.hit({type:'skill',id,...skill});
  }
  hit(event){const damage=Math.min(event.damage,this.enemyHp);this.enemyHp-=damage;this.hits++;this.damage+=damage;if(this.enemyHp===0)this.status='won';return {...event,damage,ok:true,won:this.status==='won'};}
}

function point(hand){const wrist=hand[0],knuckle=hand[9];const scale=Math.hypot(wrist.x-knuckle.x,wrist.y-knuckle.y);const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);let open=0,closed=0;for(const [pip,tip] of [[6,8],[10,12],[14,16],[18,20]]){const ratio=distance(hand[tip],wrist)/(distance(hand[pip],wrist)||.001);if(ratio>1.15)open++;if(ratio<1.04)closed++;}return {x:(wrist.x+knuckle.x)/2,y:(wrist.y+knuckle.y)/2,scale,open,closed};}
export class MotionDetector {
  constructor(){this.reset();}
  reset(){this.previous=[];this.at=0;this.cooldownUntil=0;this.armed=true;}
  update(hands,now){
    const current=(hands||[]).filter(h=>h?.length>=21).map(point),dt=(now-this.at)/1000;
    let attack=null,quiet=true;
    if(dt>=.04&&dt<=.35&&this.previous.length){
      for(const p of current){
        const prev=this.previous.reduce((best,q)=>Math.hypot(q.x-p.x,q.y-p.y)<Math.hypot(best.x-p.x,best.y-p.y)?q:best);
        const dx=p.x-prev.x,dy=p.y-prev.y,travel=Math.hypot(dx,dy),speed=travel/dt;
        if(speed>.55)quiet=false;
        const forward=prev.scale>.035&&(p.scale/prev.scale-1)>.22;
        if(this.armed&&now>=this.cooldownUntil&&p.scale>.035){
          if(p.open>=3&&dy>.075&&dy/dt>.8&&prev.y<.75)attack='slap';
          else if(p.closed>=3&&((travel>.085&&speed>1)||(forward&&travel>.025)))attack='punch';
        }
      }
    }
    if(quiet)this.armed=true;
    this.previous=current;this.at=now;
    if(attack){this.armed=false;this.cooldownUntil=now+650;return {kind:attack};}
    return null;
  }
}
