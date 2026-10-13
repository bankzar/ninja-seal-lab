import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('./dist/', import.meta.url);
const version = '0.10.22-rc.20250304';
const assets = [
 ['vendor/vision_bundle.mjs', `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/vision_bundle.mjs`],
 ...['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm'].map(f=>['vendor/wasm/'+f,`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/wasm/${f}`]),
 ['models/hand_landmarker.task','https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'],
 ['models/face_landmarker.task','https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'],
 ['models/selfie_segmenter.tflite','https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite'],
 ['vendor/LICENSE.mediapipe','https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE']
];
await Promise.all(assets.map(async([file,url])=>{const r=await fetch(url);if(!r.ok)throw Error(file+': '+r.status);const b=new Uint8Array(await r.arrayBuffer());await mkdir(new URL('.',new URL(file,root)),{recursive:true});await writeFile(new URL(file,root),b);console.log(file,b.length);}));
