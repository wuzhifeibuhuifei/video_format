export const SHOTS = [
  {
    id: "shot1",
    audioFile: "radios/project_60_shot_1.mp3",
    captionFile: "captions/shot1.json",
    durationSec: 3,
  },
  {
    id: "shot2",
    audioFile: "radios/project_60_shot_2.mp3",
    captionFile: "captions/shot2.json",
    durationSec: 2,
  },
  {
    id: "shot4",
    audioFile: "radios/project_60_shot_4.mp3",
    captionFile: "captions/shot4.json",
    durationSec: 2,
  },
  {
    id: "shot5",
    audioFile: "radios/project_60_shot_5.mp3",
    captionFile: "captions/shot5.json",
    durationSec: 33,
  },
] as const;

export const TOTAL_DURATION_SEC = SHOTS.reduce(
  (sum, s) => sum + s.durationSec,
  0
);
