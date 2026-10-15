export const SOUND_FILES=Object.freeze({fire:'fire.mp3',clone:'clone.mp3',lightning:'lightning.mp3',punch:'punch.wav',slap:'slap-hard.wav'});
const VOICES=new Set(['fire','clone','lightning']);

export class GameAudio {
  constructor({AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetch=globalThis.fetch,storage,visible=()=>!globalThis.document?.hidden}={}){
    this.Context=AudioContext;this.fetch=fetch?.bind(globalThis);this.storage=storage;this.visible=visible;
    this.enabled=true;this.ctx=null;this.ready=null;this.buffers=new Map();this.sources=new Set();this.voice=null;this.generation=0;this.failures=[];
    try{this.storage=storage??globalThis.localStorage;this.enabled=this.storage?.getItem('ninja-audio-enabled-v1')!=='false';}catch{}
  }
  // Called during a click/key gesture to satisfy browser audio autoplay rules.
  async unlock(){
    if(!this.enabled||!this.Context)return false;
    try{
      if(!this.ctx){
        this.ctx=new this.Context();this.master=this.ctx.createGain();this.master.gain.value=.72;
        this.limiter=this.ctx.createDynamicsCompressor();this.limiter.threshold.value=-3;this.limiter.knee.value=0;this.limiter.ratio.value=20;this.limiter.attack.value=.001;this.limiter.release.value=.08;
        this.master.connect(this.limiter);this.limiter.connect(this.ctx.destination);
      }
      if(this.ctx.state==='suspended')await this.ctx.resume();
      if(!this.ready){
        this.ready=Promise.allSettled(Object.entries(SOUND_FILES).map(async([id,file])=>{
          if(this.buffers.has(id))return;
          const response=await this.fetch(new URL('./assets/audio/'+file,import.meta.url));
          if(!response.ok)throw Error('Audio asset unavailable: '+id);
          const buffer=await this.ctx.decodeAudioData(await response.arrayBuffer());this.buffers.set(id,buffer);
        })).then(results=>{this.failures=results.filter(r=>r.status==='rejected').map(r=>String(r.reason));return results.every(r=>r.status==='fulfilled');});
      }
      const complete=await this.ready;if(!complete)this.ready=null;
      return complete&&this.ctx.state==='running';
    }catch(error){this.failures=[String(error)];this.ready=null;return false;}
  }
  setEnabled(enabled){
    this.enabled=!!enabled;try{this.storage?.setItem('ninja-audio-enabled-v1',String(this.enabled));}catch{}
    if(!this.enabled)this.stop();return this.enabled;
  }
  async play(id,{volume=1}={}){
    if(!this.enabled||!(id in SOUND_FILES)||!this.visible())return false;
    const generation=this.generation;
    await this.unlock();
    if(generation!==this.generation||!this.enabled||!this.visible()||this.ctx?.state!=='running'||!this.buffers.has(id))return false;
    const isVoice=VOICES.has(id);
    if(isVoice&&this.voice){try{this.voice.stop();}catch{}this.sources.delete(this.voice);}
    const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();source.buffer=this.buffers.get(id);
    gain.gain.value=Math.max(0,Math.min(1,volume))*(isVoice?1:id==='slap'?1.15:.95);
    if(!isVoice)source.playbackRate.value=.96+Math.random()*.08;
    source.connect(gain);gain.connect(this.master);this.sources.add(source);if(isVoice)this.voice=source;
    source.onended=()=>{this.sources.delete(source);if(this.voice===source)this.voice=null;source.disconnect();gain.disconnect();};
    source.start();return true;
  }
  stop(){this.generation++;for(const source of this.sources){try{source.stop();}catch{}}this.sources.clear();this.voice=null;}
}
