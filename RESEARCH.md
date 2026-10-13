# Camera ninja game research

Researched 14 October 2026. Game design decisions are marked separately from source facts.

## Naruto references and the three game seals

The official Naruto database describes ninjutsu as shaping chakra through hand signs. It does not provide an anatomical tutorial for the individual zodiac seals. [Official Ninjutsu database](https://naruto-official.com/en/news/01_1684).

For physical reference, the secondary illustrated hand-sign guide describes the following. These are visual references, not a claim that a webcam can recognize canonical seals perfectly. [Illustrated seal guide](https://www.thetechbasket.com/all-hand-signs-naruto/).

| Game label | Reference shape | Forgiving game instruction |
| --- | --- | --- |
| ชวด / Rat / Ne | One hand's index and middle fingers are raised together, the other hand wraps them. | Raise two joined fingers; hold the other hand near their base. Either handedness is acceptable. |
| ฉลู / Ox / Ushi | Hands cross; two bent fingers rest on the opposite hand, while other extended fingers suggest horns. | Cross the two hands, one more upright and one more horizontal. |
| ระกา / Bird / Tori | Middle and pinky fingertips meet the opposite fingertips; index and ring fingers interlace; thumb tips touch. | Join fingertips into a bird/beak or triangle shape, allowing loose finger placement. |

Bird has variants in the illustrations and fan descriptions; avoid presenting one webcam silhouette as a definitive anatomical standard. Rat handedness also appears mirrored between references. A forgiving game should accept mirrored execution.

**Game design, not canonical combinations:**

- Sharingan + fire: Ox → Bird → Rat.
- Clone snapshot: Bird → Rat → Ox.
- Chidori-style lightning: Rat → Ox → Bird, matching the user's example.

The three permutations above are custom short combinations. For comparison, fan references list Fireball as Snake → Ram → Monkey → Boar → Horse → Tiger, Chidori as Ox → Hare → Monkey, and Shadow Clone as its own crossed-finger seal. Do not label these game permutations as original manga sequences. [Seal and sequence reference](https://www.thetechbasket.com/all-hand-signs-naruto/).

The official site provides Sharingan visual references in its red-eyes merchandise announcement. Recommended original rendering: red iris, dark pupil, circular dark ring, three comma-like marks. The simultaneous fire effect is the requested game combination, not a claim that basic Sharingan automatically starts fires. [Official Sharingan visual reference](https://naruto-official.com/en/news/01_2213).

The official Chidori entry describes a concentrated-chakra thrust used with Sharingan. Use the article's illustrated scene as the reference for the lightning-hand motif. The game only needs an animated visual effect around the tracked hand. [Official Chidori entry](https://naruto-official.com/en/news/01_1715).

## MediaPipe implementation facts

Use the official `@mediapipe/tasks-vision` JavaScript package. Initialize shared WASM with `FilesetResolver.forVisionTasks(wasmRoot)`, then create the tasks with `createFromOptions`. For a deployed app, pin the package and WASM to the same version, or serve the installed package's WASM locally. Hand Landmarker gives 21 normalized landmarks per hand and handedness. Set `numHands: 2`, `runningMode: 'VIDEO'`. Inference is synchronous, so throttle detection or move it to a worker if needed. [Hand Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js).

Exact current APIs:

```js
const vision = await FilesetResolver.forVisionTasks('/wasm');
const hands = await HandLandmarker.createFromOptions(vision, {
  baseOptions: { modelAssetPath: '/models/hand_landmarker.task' },
  runningMode: 'VIDEO',
  numHands: 2,
});
const result = hands.detectForVideo(video, performance.now());
```

Pass a strictly increasing timestamp in milliseconds and only process new video frames. Some guide snippets omit the timestamp; the current JS signature explicitly requires it. [HandLandmarker JS API](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.handlandmarker).

Face Landmarker uses the same initialization structure, with `numFaces: 1`, `runningMode: 'VIDEO'`. It produces 478 landmarks and supports eye effects; smoothing applies when tracking one face. Call `faces.detectForVideo(video, timestampMs)`. [Face guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js), [FaceLandmarker JS API](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.facelandmarker).

Official source specifies left iris rim 474–477, right iris rim 469–472. Average each rim for its center and use the spread for radius; clip the effect to the eye contour to avoid painting on eyelids. Left eye contour includes 263/362; right includes 33/133. Mirror video and effects with the same transform. [Official face connection source](https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts).

For clone cutouts, initialize `ImageSegmenter` with `runningMode: 'IMAGE'`, `outputConfidenceMasks: true`, `outputCategoryMask: false`; call `segment(snapshotCanvas, result => { ... })`. Copy mask data or finish compositing inside the callback: returned mask lifetime is only guaranteed during it. The API also supports `segmentForVideo(video, timestampMs, callback)`, but a single snapshot needs only image mode. [Segmenter API](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.imagesegmenter).

Verified official model links (download and serve locally when possible):

- [Hand model](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task), listed in the [official hand model overview](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/index).
- [Face model](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task), listed in the [official face model overview](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/index).
- [Selfie segmentation model](https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite), listed in the [official segmentation overview](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/index). Its categories are background 0 and person 1. Use the person mask to remove the original background before drawing four displaced snapshot copies around the live player.

## Forgiving recognition recommendations

The following are engineering choices, not accuracy claims from MediaPipe:

1. Normalize finger distances by wrist-to-middle-knuckle distance, with aspect-ratio-correct image coordinates. Use finger joint angles instead of simply comparing tip y-coordinates, so rotated hands still work.
2. Score coarse features: Rat favors adjacent extended index/middle with ring/pinky curled; Ox favors crossed/perpendicular palm directions and horn-like extension; Bird favors paired fingertip proximity, joined thumbs and more symmetrical hand directions. Allow either left/right assignment.
3. Call this a **similarity score**, never a probability or guaranteed recognition accuracy. Start acceptance at 0.35 (35%), configurable between 0.30 and 0.40. Detector presence/tracking confidence is a separate setting and does not measure seal similarity.
4. Require a stable sign for roughly 300–450 ms; accept once, then require a pose change or brief neutral interval before the next seal. Expire incomplete combinations after several seconds. Show detected name and score on the right so the user can adjust.
5. Classify the best of all three signs; do not grant the expected sign a score advantage that lets one static pose complete a combination. Reject no-hand frames, distant hands and invalid landmarks.
6. Two interacting hands can occlude fingers. Treat the initial classifier as a forgiving heuristic requiring real-camera tuning, and provide clear illustrated game poses plus optional per-user calibration. Never advertise the 35% threshold as measured 35% resemblance to canon.
