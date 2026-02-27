import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  OffthreadVideo,
  useCurrentFrame,
  Easing,
} from 'remotion';
import type { BookRevealProps } from '../types';

const IMAGE_ENTER_FRAME = 24;
const SLIDE_DURATION = 15;
const IMAGE_BASE_HEIGHT = 450;
const IMAGE_ASPECT = 1696 / 2528;
const IMAGE_BASE_WIDTH = IMAGE_BASE_HEIGHT * IMAGE_ASPECT;

export const BookReveal: React.FC<BookRevealProps> = ({ videoSrc, imageSrc }) => {
  const frame = useCurrentFrame();
  const slideEnd = IMAGE_ENTER_FRAME + SLIDE_DURATION;

  const translateX = interpolate(frame, [IMAGE_ENTER_FRAME, slideEnd], [490, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const translateY = 120;

  const scale = interpolate(frame, [IMAGE_ENTER_FRAME, slideEnd], [0.6, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const showImage = frame >= IMAGE_ENTER_FRAME;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <OffthreadVideo
        src={videoSrc}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {showImage && (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <Img
            src={imageSrc}
            style={{
              width: IMAGE_BASE_WIDTH,
              height: IMAGE_BASE_HEIGHT,
              objectFit: 'contain',
              transform: `translateX(${translateX}px) translateY(${translateY}px) scale(${scale})`,
            }}
          />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
