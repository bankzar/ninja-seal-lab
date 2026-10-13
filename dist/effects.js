const TAU=Math.PI*2;
export class Effects {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.active=null;this.clones=null;this.demo=false;}
  start(id,now,demo=false){this.active=id;this.started=now;this.demo=demo;this.clones=null;}
  clear(){this.active=null;this.clones=null;}
  draw(video,face,hands,now){
    const c=this.ctx,w=this.canvas.width,h=this.canvas.height;
    c.clearRect(0,0,w,h);
    if(video?.readyState>=2){c.save();c.translate(w,0);c.scale(-1,1);c.drawImage(video,0,0,w,h);c.restore();}
    else if(this.active && this.demo)this.drawDemo(w,h);
    if(!this.active)return;
    const age=(now-this.started)/1000;
    if(age>6){this.clear();return;}
    c.save();c.globalAlpha=Math.min(1,age*4,(6-age)*3);
    if(this.active==='fire'){this.eyes(face,age,w,h);this.fire(age,w,h);}
    if(this.active==='clone')this.clone(age,w,h);
    if(this.active==='lightning')this.lightning(hands,age,w,h);
    c.restore();
  }
  drawDemo(w,h){const c=this.ctx;c.fillStyle='#222a1d';c.fillRect(0,0,w,h);c.fillStyle='#647453';c.beginPath();c.ellipse(w*.5,h*.42,w*.095,h*.15,0,0,TAU);c.fill();c.beginPath();c.ellipse(w*.5,h*.88,w*.21,h*.28,0,0,TAU);c.fill();c.fillStyle='#12180f';c.beginPath();c.ellipse(w*.467,h*.41,w*.014,h*.008,0,0,TAU);c.ellipse(w*.533,h*.41,w*.014,h*.008,0,0,TAU);c.fill();}
  eyes(face,t,w,h){
    let eyes=[];
    if(face?.length>477){
      for(const ids of [[474,475,476,477],[469,470,471,472]]){
        const points=ids.map(i=>({x:(1-face[i].x)*w,y:face[i].y*h}));
        const p={x:points.reduce((s,p)=>s+p.x,0)/4,y:points.reduce((s,p)=>s+p.y,0)/4};
        p.r=points.reduce((s,q)=>s+Math.hypot(q.x-p.x,q.y-p.y),0)/4;eyes.push(p);
      }
    }else if(this.demo)eyes=[{x:w*.467,y:h*.41,r:w*.012},{x:w*.533,y:h*.41,r:w*.012}];
    const c=this.ctx;
    for(const p of eyes){const r=Math.max(2,p.r);c.save();c.translate(p.x,p.y);c.shadowColor='#ff271d';c.shadowBlur=r*2.8;c.fillStyle='#cc151d';c.beginPath();c.ellipse(0,0,r,r*.9,0,0,TAU);c.fill();c.shadowBlur=0;c.strokeStyle='#28070b';c.lineWidth=Math.max(.7,r*.1);c.beginPath();c.arc(0,0,r*.68,0,TAU);c.stroke();c.fillStyle='#100609';c.beginPath();c.arc(0,0,r*.25,0,TAU);c.fill();for(let i=0;i<3;i++){c.save();c.rotate(t*.55+i*TAU/3);c.beginPath();c.arc(0,-r*.65,r*.19,0,TAU);c.fill();c.beginPath();c.moveTo(-r*.16,-r*.7);c.quadraticCurveTo(-r*.35,-r*.4,-r*.1,-r*.32);c.lineTo(r*.13,-r*.58);c.fill();c.restore();}c.restore();}
  }
  fire(t,w,h){const c=this.ctx;c.save();c.globalCompositeOperation='screen';
    for(let i=0;i<28;i++){const x=w*i/27,base=h+30;const height=h*(.15+.16*(Math.sin(i*9.7+t*7)*.5+.5));const width=w*(.022+.012*(Math.sin(i*7)*.5+.5)),sway=Math.sin(t*5+i*3)*width*1.4;const top=base-height;const g=c.createLinearGradient(x,base,x,top);g.addColorStop(0,'#bd2900d0');g.addColorStop(.35,'#f76706c0');g.addColorStop(.72,'#ffbf36b0');g.addColorStop(1,'#ffe58c40');c.fillStyle=g;c.beginPath();c.moveTo(x-width*1.8,base);c.bezierCurveTo(x-width*2,base-height*.4,x+width+sway,top+height*.3,x+sway,top);c.bezierCurveTo(x+width*.8+sway,top+height*.3,x+width*2,base-height*.35,x+width*1.8,base);c.closePath();c.fill();}
    for(let i=0;i<22;i++){const seed=i*23.41,cycle=(t*.58+i*.137)%1,x=((Math.sin(seed)*.5+.5)*1.1-.05)*w+Math.sin(t*3+seed)*18,y=h-cycle*h*.4,r=(1-cycle)*(7+Math.sin(seed)*4)*w/600;const g=c.createRadialGradient(x,y,0,x,y,r*3);g.addColorStop(0,'#ffce4270');g.addColorStop(.5,'#ef5c0a40');g.addColorStop(1,'#c5210000');c.fillStyle=g;c.beginPath();c.ellipse(x,y,r*3,r*6,-Math.sin(seed)*.3,0,TAU);c.fill();}
    for(let i=0;i<45;i++){const q=(t*.3+i*.091)%1;c.fillStyle=`rgba(255,${120+i%110},30,${1-q})`;c.fillRect((Math.sin(i*90)*.5+.5)*w+Math.sin(t+i)*15,h-q*h,1.5,3);}c.restore();}
  clone(t,w,h){const c=this.ctx;const snap=this.clones;if(!snap&&!this.demo)return;const enter=Math.min(1,t*3);for(const [i,offset] of [-2,-1,1,2].entries()){c.save();const scale=.60-Math.abs(offset)*.045;const x=w*.5+offset*w*.185*enter;const y=h*.54+Math.abs(offset)*h*.045;c.translate(x,y);c.globalAlpha*=.9;c.shadowColor='#b3efbd';c.shadowBlur=18;if(snap){c.drawImage(snap,-w*scale/2,-h*scale/2,w*scale,h*scale);}else{c.scale(scale,scale);c.translate(-w*.5,-h*.54);c.fillStyle='#94c18b';c.beginPath();c.ellipse(w*.5,h*.42,w*.095,h*.15,0,0,TAU);c.fill();c.beginPath();c.ellipse(w*.5,h*.88,w*.21,h*.28,0,0,TAU);c.fill();}c.restore();}if(t<1.1){c.save();c.globalAlpha*=1-t/1.1;for(let i=0;i<16;i++){c.fillStyle='#d6e4bf60';c.beginPath();c.arc(w*.5+Math.sin(i*10)*w*.4,h*.7+Math.cos(i*6)*h*.25,20+t*60,0,TAU);c.fill();}c.restore();}}
  lightning(hands,t,w,h){const c=this.ctx;let points=(hands||[]).map(hand=>({x:(1-(hand[0].x+hand[9].x)/2)*w,y:(hand[0].y+hand[9].y)/2*h}));if(!points.length&&this.demo)points=[{x:w*.31,y:h*.65},{x:w*.69,y:h*.65}];for(const p of points){c.save();c.globalCompositeOperation='screen';const g=c.createRadialGradient(p.x,p.y,1,p.x,p.y,72*w/600);g.addColorStop(0,'#dcfdffb0');g.addColorStop(.25,'#39b8ff65');g.addColorStop(1,'#086bff00');c.fillStyle=g;c.fillRect(p.x-100,p.y-100,200,200);const seed=Math.floor(t*19);for(let b=0;b<11;b++){const angle=b*TAU/11+Math.sin(seed+b)*.5;const length=(38+(Math.sin(b*17+seed)*.5+.5)*68)*w/600;const path=new Path2D();path.moveTo(p.x,p.y);for(let k=1;k<=7;k++){const d=length*k/7;const j=Math.sin(seed*11+b*8+k*21)*12;path.lineTo(p.x+Math.cos(angle)*d+Math.sin(angle)*j,p.y+Math.sin(angle)*d+Math.cos(angle)*j);}c.shadowColor='#168aff';c.shadowBlur=17;c.strokeStyle='#329fff';c.lineWidth=4;c.stroke(path);c.strokeStyle='#e6ffff';c.lineWidth=1.35;c.shadowBlur=5;c.stroke(path);}c.restore();}}
}
