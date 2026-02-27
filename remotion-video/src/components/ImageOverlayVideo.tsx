import React from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  useCurrentFrame,
  interpolate,
} from 'remotion';
import type { ImageOverlayVideoProps } from '../types';

export const ImageOverlayVideo: React.FC<ImageOverlayVideoProps> = ({
  videoSrc,
  imageSrc,
  initialScale,
  finalScale,
  initialX,
  initialY,
  targetX,
  targetY,
  moveStartFrame,
  moveDurationFrames,
  scaleDurationFrames,
  imageWidth,
  imageHeight,
}) => {
  const frame = useCurrentFrame();

  const moveEndFrame = moveStartFrame + moveDurationFrames;
  const scaleStartFrame = moveEndFrame;
  const scaleEndFrame = scaleStartFrame + scaleDurationFrames;

  // 位置插值：从初始位置移动到目标位置
  const x = interpolate(frame, [moveStartFrame, moveEndFrame], [initialX, targetX], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(frame, [moveStartFrame, moveEndFrame], [initialY, targetY], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // 缩放插值：移动结束后从 initialScale 放大到 finalScale
  const scale = interpolate(frame, [scaleStartFrame, scaleEndFrame], [initialScale, finalScale], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      <OffthreadVideo src={videoSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <AbsoluteFill>
        <Img
          src={imageSrc}
          style={{
            position: 'absolute',
            width: imageWidth,
            height: imageHeight,
            left: `${x}%`,
            top: `${y}%`,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
