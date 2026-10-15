const TAU=Math.PI*2;
export class BattleScene {
  constructor(canvas,{resizeToParent=false}={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.image=new Image();this.image.src='./assets/madara-battle.png';this.events=[];this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(resizeToParent){this.resizeObserver=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;if(width>0&&height>0){const density=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(width*density);canvas.height=Math.round(height*density);}});this.resizeObserver.observe(canvas.parentElement);}
  }
  add(event,now){this.events.push({...event,at:now});}
  draw(battle,now){
    const c=this.ctx,w=this.canvas.width,h=this.canvas.height,t=now/1000;
    this.events=this.events.filter(e=>now-e.at<1700);
    c.clearRect(0,0,w,h);const sky=c.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#170d13');sky.addColorStop(.6,'#392026');sky.addColorStop(1,'#141915');c.fillStyle=sky;c.fillRect(0,0,w,h);
    c.fillStyle='#dc6b5b22';c.beginPath();c.arc(w*.77,h*.2,w*.18,0,TAU);c.fill();c.fillStyle='#a34f4820';c.beginPath();c.arc(w*.77,h*.2,w*.22,0,TAU);c.fill();
    for(let layer=0;layer<3;layer++){c.fillStyle=['#34292b','#282427','#202322'][layer];c.beginPath();c.moveTo(0,h);for(let i=0;i<=10;i++){const x=w*i/10,y=h*(.48+layer*.13)-Math.sin(i*7+layer*11)*h*.12;c.lineTo(x,y);}c.lineTo(w,h);c.fill();}
    const glow=c.createRadialGradient(w*.5,h*.74,0,w*.5,h*.74,w*.6);glow.addColorStop(0,'#e5533320');glow.addColorStop(1,'#e5533300');c.fillStyle=glow;c.fillRect(0,0,w,h);
    c.strokeStyle='#b67f5940';c.lineWidth=1;c.beginPath();c.ellipse(w*.5,h*.88,w*.34,h*.05,0,0,TAU);c.stroke();c.beginPath();c.ellipse(w*.5,h*.88,w*.3,h*.042,0,0,TAU);c.stroke();
    const hit=this.events.findLast(e=>e.type==='basic'||e.type==='skill');const hitAge=hit?(now-hit.at)/1000:10;
    const isLost=battle.status==='won';const bob=this.reduced?0:Math.sin(t*1.8)*h*.005;
    const knock=hitAge<.25&&!this.reduced?Math.sin(hitAge*55)*w*.012:0;
    c.save();c.translate(knock,bob);if(isLost)c.globalAlpha=.45;
    if(this.image.complete&&this.image.naturalWidth){const drawH=h*.86,drawW=drawH*this.image.naturalWidth/this.image.naturalHeight;c.drawImage(this.image,w*.5-drawW*.5,h*.07,drawW,drawH);}
    c.restore();
    if(battle.telegraphed&&battle.status==='active'){
      const pulse=this.reduced ? 0.5 : (Math.sin(t*14)*.5+.5);c.fillStyle=`rgba(255,65,53,${.03+pulse*.09})`;c.fillRect(0,0,w,h);c.strokeStyle='#f47867';c.lineWidth=2;c.beginPath();c.arc(w*.5,h*.43,w*(.18+pulse*.018),0,TAU);c.stroke();
      c.textAlign='center';c.fillStyle='#ffd4b9';c.font=`600 ${w*.038}px sans-serif`;c.fillText('⚠ มาดาระกำลังโจมตี!',w*.5,h*.12);
    }
    for(const e of this.events){const age=(now-e.at)/1000,alpha=Math.max(0,1-age/1.5);c.save();c.globalAlpha=alpha;
      if(e.type==='basic'||e.type==='skill'){
        const x=w*.5,y=h*(e.id==='slap'?.27:.48),color=e.id==='lightning'?'#8ee7ff':e.id==='clone'?'#c9edb3':'#ffc48a';
        if(e.type==='basic'){c.strokeStyle=color;c.lineWidth=w*.012;c.beginPath();c.moveTo(x-w*.22,y+h*.12);c.lineTo(x+w*.2,y-h*.1);c.stroke();c.beginPath();c.arc(x,y,w*(.08+age*.1),0,TAU);c.lineWidth=2;c.stroke();}
        if(e.id==='fire'){const glow=c.createRadialGradient(x,y,2,x,y,w*.4);glow.addColorStop(0,'#fff2b9dd');glow.addColorStop(.3,'#ff9b1a90');glow.addColorStop(1,'#f22e0000');c.fillStyle=glow;c.fillRect(0,0,w,h);for(let i=0;i<12;i++){c.fillStyle=i%2?'#ffbd4270':'#ef4f1870';c.beginPath();const px=w*(.18+i*.06);c.moveTo(px,h*.83);c.quadraticCurveTo(px-w*.1,h*.5,px+Math.sin(t*9+i)*20,h*(.27+Math.sin(i*9+t*5)*.1));c.quadraticCurveTo(px+w*.13,h*.6,px+w*.06,h*.83);c.fill();}}
        if(e.id==='lightning'){c.strokeStyle=color;c.lineWidth=3;c.shadowColor='#32b3ff';c.shadowBlur=20;for(let i=0;i<9;i++){c.beginPath();c.moveTo(x,y);for(let k=1;k<6;k++)c.lineTo(x+Math.cos(i*TAU/9)*w*k*.06+Math.sin(k*9+t*25)*12,y+Math.sin(i*TAU/9)*h*k*.07);c.stroke();}}
        if(e.id==='clone'){for(let i=0;i<8;i++){c.fillStyle='#b4d8a65a';c.beginPath();c.arc(w*.5+Math.sin(i*13)*w*.27,h*.55+Math.cos(i*7)*h*.16,8+age*40,0,TAU);c.fill();}c.strokeStyle=color;c.lineWidth=5;c.beginPath();c.moveTo(w*.1,h*.68);c.lineTo(w*.88,h*.33);c.moveTo(w*.88,h*.68);c.lineTo(w*.1,h*.33);c.stroke();}
        c.shadowColor='#f4c99a';c.shadowBlur=12;c.fillStyle='#fff5de';for(let i=0;i<12;i++){const a=i*TAU/12,d=10+age*w*.23;c.fillRect(x+Math.cos(a)*d,y+Math.sin(a)*d,3,5);}
        c.shadowBlur=0;c.textAlign='center';c.font=`700 ${w*.105}px 'Space Grotesk',sans-serif`;c.fillStyle=color;c.strokeStyle='#231214';c.lineWidth=5;c.strokeText('-'+e.damage,x,y-h*.07-age*h*.12);c.fillText('-'+e.damage,x,y-h*.07-age*h*.12);
      }
      if(e.type==='enemy-hit'){c.fillStyle='#e6433e30';c.fillRect(0,0,w,h);c.strokeStyle='#ff7559';c.lineWidth=4;c.beginPath();c.arc(w*.5,h*.5,w*age*.7,0,TAU);c.stroke();}
      c.restore();
    }
    for(let i=0;i<14;i++){c.fillStyle='#d8945060';const q=(t*.08+i*.073)%1;c.fillRect((Math.sin(i*17)*.5+.5)*w,h*(1-q),2,3);}
    if(battle.status==='idle'||battle.status==='paused'){c.fillStyle='#100e1233';c.fillRect(0,0,w,h);}
  }
}
