# Battle artwork

## Audio

Bundled in `dist/assets/audio/`: `fire.mp3` (写輪眼！火遁！), `clone.mp3` (影分身の術！), `lightning.mp3` (千鳥！), `punch.wav`, `slap.wav`. The spoken callouts were generated with Japanese voice `ja-JP-KeitaNeural` through [edge-tts](https://github.com/rany2/edge-tts); hiragana pronunciations, rate and pitch are recorded in the adjacent `manifest.json`. Impact sounds are original procedural synthesis. `generate_audio.py` reproduces preparation. The game serves these files locally; no microphone or runtime speech service is used.

## Madara illustration

- Saved asset: `dist/assets/madara-battle.png` (1024 × 1536 RGBA).
- Created with the built-in ImageGen tool; original retained in the Codex generated-images directory.
- Used as the Madara opponent sprite in `dist/battle-scene.js`.
- No game footage or player camera images were sent to ImageGen.

Final generation prompt:

> Use case: stylized-concept. Asset type: transparent 2D browser battle game opponent character. Create ONE full body Madara Uchiha from Naruto, immediately recognizable: long very spiky black hair, pale stern face, red Sharingan eyes, dark navy clothing and layered crimson samurai armor, dark sandals. Confident battle stance slightly turned three-quarter toward the viewer, one hand forward preparing to fight. Beautiful crisp anime cel shaded illustration, dramatic crimson rim light, readable silhouette on a dark charcoal UI. Character centered, feet and hair entirely inside frame, generous clear margin, portrait composition. Truly transparent background, no scene, no floor, no text, no logos, no border, no other characters, no vignette. This is a static standalone game sprite, not a movie storyboard.
