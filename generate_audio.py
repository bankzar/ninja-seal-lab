"""Generate bundled Japanese callouts and original impact sounds.

Build-only dependency: edge-tts==7.3.1. FFmpeg trims the callout lead-in.
No speech service is used by the deployed game.
"""
import asyncio
import json
import math
from pathlib import Path
import random
import shutil
import struct
import subprocess
import sys
import wave

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'qa-artifacts' / 'tts-runtime'))
import edge_tts

DEST = ROOT / 'dist' / 'assets' / 'audio'
STAGING = ROOT / 'qa-artifacts' / 'audio-build'
CALLOUTS = {'fire': '写輪眼！火遁！', 'clone': '影分身の術！', 'lightning': '千鳥！'}
SPOKEN = {'fire': 'しゃりんがん！かとん！', 'clone': 'かげぶんしんのじゅつ！', 'lightning': 'ちどり！'}

def impact(kind):
    rate = 44100
    duration = .27 if kind == 'punch' else .34
    rng = random.Random(781 if kind == 'punch' else 446)
    samples = []
    last = 0
    for i in range(int(rate * duration)):
        t = i / rate
        noise = rng.uniform(-1, 1)
        crack = noise - last * .8
        last = noise
        attack = min(1, t / .0015)
        if kind == 'punch':
            value = attack * (.6 * crack * math.exp(-t * 55) + .8 * math.sin(2 * math.pi * (95 * t - 105 * t*t)) * math.exp(-t * 24))
        else:
            # A dense, dry palm crack: fast attack, bright noise and a pitched smack.
            bite = .95 * crack * math.exp(-t * 37) + .35 * noise * math.exp(-t * 28)
            body = .42 * math.sin(2 * math.pi * (1150*t - 1300*t*t)) * math.exp(-t * 48)
            body += .22 * math.sin(2 * math.pi * 215*t) * math.exp(-t * 40)
            value = min(1, t / .00025) * math.tanh(3.8 * (bite + body))
        value *= min(1, (duration - t) / .025)
        samples.append(value)
    if kind == 'slap':
        dry = samples[:]
        for i in range(len(samples)):
            for delay, gain in [(.023,.20),(.047,.11),(.079,.055)]:
                offset = i - round(delay * rate)
                if offset >= 0:
                    samples[i] += dry[offset] * gain
        # Keep the palm crack bright while removing ultrasonic noise/ringing.
        taps = 65
        cutoff = 7000 / rate
        kernel = []
        for j in range(taps):
            n = j - taps // 2
            sinc = 2*cutoff if n == 0 else math.sin(2*math.pi*cutoff*n)/(math.pi*n)
            window = .42 - .5*math.cos(2*math.pi*j/(taps-1)) + .08*math.cos(4*math.pi*j/(taps-1))
            kernel.append(sinc*window)
        scale = sum(kernel)
        kernel = [x/scale for x in kernel]
        dry = samples[:]
        samples = [sum(k*dry[i+j-taps//2] for j,k in enumerate(kernel) if 0 <= i+j-taps//2 < len(dry)) for i in range(len(dry))]
    peak = max(abs(x) for x in samples)
    filename = 'slap-hard.wav' if kind == 'slap' else 'punch.wav'
    with wave.open(str(DEST / filename), 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        f.writeframes(b''.join(struct.pack('<h', round(x / peak * (.85 if kind == 'slap' else .88) * 32767)) for x in samples))

async def main():
    DEST.mkdir(parents=True, exist_ok=True)
    STAGING.mkdir(parents=True, exist_ok=True)
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise RuntimeError('FFmpeg is required for audio preparation')
    for name, text in ([] if '--impacts-only' in sys.argv else CALLOUTS.items()):
        raw = STAGING / f'{name}-raw.mp3'
        await asyncio.wait_for(edge_tts.Communicate(SPOKEN[name], voice='ja-JP-KeitaNeural', rate='+15%', pitch='-12Hz').save(str(raw)), timeout=35)
        subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(raw), '-af', 'silenceremove=start_periods=1:start_duration=0.01:start_threshold=-42dB,afade=t=in:d=0.008', '-codec:a', 'libmp3lame', '-b:a', '96k', str(DEST / f'{name}.mp3')], check=True)
        print(name, text, (DEST / f'{name}.mp3').stat().st_size, flush=True)
    for kind in ['punch', 'slap']:
        impact(kind)
        filename = 'slap-hard.wav' if kind == 'slap' else 'punch.wav'
        print(kind, (DEST / filename).stat().st_size, flush=True)
    (DEST / 'manifest.json').write_text(json.dumps({'voice': 'ja-JP-KeitaNeural', 'generator': 'edge-tts 7.3.1', 'rate': '+15%', 'pitch': '-12Hz', 'callouts': CALLOUTS, 'spoken': SPOKEN, 'impacts': 'Original deterministic procedural synthesis in generate_audio.py', 'slap': 'slap-hard.wav: compressed palm crack with short room reflections, v2'}, ensure_ascii=False, indent=2), encoding='utf-8')

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(main())
