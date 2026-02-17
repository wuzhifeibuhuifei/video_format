import React from 'react';
import { Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { KenBurnsType } from '../types';

type Props = {
  src: string;
  type: KenBurnsType;
  zoomRatio?: number;
  panRange?: number;
};

export const KenBurnsImage: React.FC<Props> = ({
  src,
  type,
  zoomRatio = 1.12,
  panRange = 50,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();

  const progress = frame / durationInFrames;

  // 随机选择效果类型
  const effectType = type === 'random'
    ? getRandomEffect(src)
    : type;

  const transform = getTransform(effectType, progress, zoomRatio, panRange);

  return (
    <div style={{ width, height, overflow: 'hidden' }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform,
          transformOrigin: 'center center',
        }}
      />
    </div>
  );
};

// 基于 src 生成稳定的随机效果
function getRandomEffect(src: string): Exclude<KenBurnsType, 'random'> {
  const effects: Exclude<KenBurnsType, 'random'>[] = [
    'zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'pan_up', 'pan_down'
  ];
  const hash = src.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return effects[hash % effects.length];
}

// 根据效果类型计算 transform
function getTransform(
  type: Exclude<KenBurnsType, 'random'>,
  progress: number,
  zoomRatio: number,
  panRange: number
): string {
  switch (type) {
    case 'zoom_in': {
      const scale = interpolate(progress, [0, 1], [1, zoomRatio]);
      return `scale(${scale})`;
    }
    case 'zoom_out': {
      const scale = interpolate(progress, [0, 1], [zoomRatio, 1]);
      return `scale(${scale})`;
    }
    case 'pan_left': {
      const translateX = interpolate(progress, [0, 1], [panRange, -panRange]);
      return `scale(${zoomRatio}) translateX(${translateX}px)`;
    }
    case 'pan_right': {
      const translateX = interpolate(progress, [0, 1], [-panRange, panRange]);
      return `scale(${zoomRatio}) translateX(${translateX}px)`;
    }
    case 'pan_up': {
      const translateY = interpolate(progress, [0, 1], [panRange, -panRange]);
      return `scale(${zoomRatio}) translateY(${translateY}px)`;
    }
    case 'pan_down': {
      const translateY = interpolate(progress, [0, 1], [-panRange, panRange]);
      return `scale(${zoomRatio}) translateY(${translateY}px)`;
    }
    default:
      return 'scale(1)';
  }
}
