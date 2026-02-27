import { useMemo } from "react";
import { AbsoluteFill, Loop, OffthreadVideo, Sequence, staticFile, useVideoConfig } from "remotion";
import { ShotScene } from "./ShotScene";
import { SHOTS } from "./shots";

export const MainVideo: React.FC = () => {
  const { fps } = useVideoConfig();

  const shotSequences = useMemo(() => {
    return SHOTS.reduce<
      Array<{
        shot: (typeof SHOTS)[number];
        fromFrame: number;
        durationInFrames: number;
      }>
    >((acc, shot) => {
      const lastEnd =
        acc.length > 0
          ? acc[acc.length - 1].fromFrame + acc[acc.length - 1].durationInFrames
          : 0;
      const durationInFrames = Math.round(shot.durationSec * fps);
      return [...acc, { shot, fromFrame: lastEnd, durationInFrames }];
    }, []);
  }, [fps]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Loop durationInFrames={Math.round(4.53 * fps)}>
        <OffthreadVideo
          src={staticFile("background-video/background_h264.mp4")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          muted
        />
      </Loop>

      {shotSequences.map(({ shot, fromFrame, durationInFrames }) => (
        <Sequence
          key={shot.id}
          from={fromFrame}
          durationInFrames={durationInFrames}
          premountFor={Math.round(0.5 * fps)}
        >
          <ShotScene
            audioFile={shot.audioFile}
            captionFile={shot.captionFile}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
