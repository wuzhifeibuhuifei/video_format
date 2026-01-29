import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/NotoSansSC';
import type { SubtitlePosition } from '../types';

// 加载中文字体
const { fontFamily } = loadFont();

type Props = {
  text: string;
  position?: SubtitlePosition;
  fontSize?: number;
  strokeWidth?: number;
};

export const Subtitle: React.FC<Props> = ({
  text,
  position = 'bottom',
  fontSize = 60,
  strokeWidth = 6,
}) => {
  const { height } = useVideoConfig();

  const positionStyle = getPositionStyle(position, height);

  return (
    <AbsoluteFill style={positionStyle}>
      <div
        style={{
          fontFamily,
          fontSize,
          fontWeight: 'bold',
          color: 'white',
          textShadow: generateTextShadow(strokeWidth),
          textAlign: 'center',
          maxWidth: '90%',
          lineHeight: 1.4,
          padding: '0 5%',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

function getPositionStyle(
  position: SubtitlePosition,
  height: number
): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  };

  switch (position) {
    case 'top':
      return { ...base, alignItems: 'flex-start', paddingTop: height * 0.1 };
    case 'center':
      return base;
    case 'bottom':
    default:
      return { ...base, alignItems: 'flex-end', paddingBottom: height * 0.18 };
  }
}

function generateTextShadow(strokeWidth: number): string {
  const shadows: string[] = [];
  for (let x = -strokeWidth; x <= strokeWidth; x++) {
    for (let y = -strokeWidth; y <= strokeWidth; y++) {
      if (x !== 0 || y !== 0) {
        shadows.push(`${x}px ${y}px 0 #000`);
      }
    }
  }
  return shadows.join(', ');
}
