import React from 'react';
import { Audio, useVideoConfig, interpolate } from 'remotion';

type Props = {
  src: string;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
};

export const BackgroundMusic: React.FC<Props> = ({
  src,
  volume = 0.2,
  fadeIn = 2,
  fadeOut = 3,
}) => {
  const { fps, durationInFrames } = useVideoConfig();

  const fadeInFrames = fadeIn * fps;
  const fadeOutFrames = fadeOut * fps;
  const totalFrames = durationInFrames;

  const volumeCallback = (frame: number) => {
    return interpolate(
      frame,
      [0, fadeInFrames, totalFrames - fadeOutFrames, totalFrames],
      [0, volume, volume, 0],
      {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }
    );
  };

  return <Audio src={src} volume={volumeCallback} loop />;
};
