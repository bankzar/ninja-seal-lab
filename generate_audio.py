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
    duration = .27 if kind == 'punch' else .20
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
            envelope = math.exp(-t * 70) + (.23 * math.exp(-(t-.018) * 90) if t > .018 else 0)
            value = attack * (.95 * crack * envelope + .30 * math.sin(2 * math.pi * 240 * t) * math.exp(-t * 50))
        value *= min(1, (duration - t) / .025)
        samples.append(value)
    peak = max(abs(x) for x in samples)
    with wave.open(str(DEST / f'{kind}.wav'), 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        f.writeframes(b''.join(struct.pack('<h', round(x / peak * .88 * 32767)) for x in samples))

async def main():
    DEST.mkdir(parents=True, exist_ok=True)
    STAGING.mkdir(parents=True, exist_ok=True)
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise RuntimeError('FFmpeg is required for audio preparation')
    for name, text in CALLOUTS.items():
        raw = STAGING / f'{name}-raw.mp3'
        await asyncio.wait_for(edge_tts.Communicate(SPOKEN[name], voice='ja-JP-KeitaNeural', rate='+15%', pitch='-12Hz').save(str(raw)), timeout=35)
        subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(raw), '-af', 'silenceremove=start_periods=1:start_duration=0.01:start_threshold=-42dB,afade=t=in:d=0.008', '-codec:a', 'libmp3lame', '-b:a', '96k', str(DEST / f'{name}.mp3')], check=True)
        print(name, text, (DEST / f'{name}.mp3').stat().st_size, flush=True)
    for kind in ['punch', 'slap']:
        impact(kind)
        print(kind, (DEST / f'{kind}.wav').stat().st_size, flush=True)
    (DEST / 'manifest.json').write_text(json.dumps({'voice': 'ja-JP-KeitaNeural', 'generator': 'edge-tts 7.3.1', 'rate': '+15%', 'pitch': '-12Hz', 'callouts': CALLOUTS, 'spoken': SPOKEN, 'impacts': 'Original deterministic procedural synthesis in generate_audio.py'}, ensure_ascii=False, indent=2), encoding='utf-8')

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(main())
