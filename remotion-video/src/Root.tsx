import React from 'react';
import { Composition, staticFile } from 'remotion';
import { VideoComposition } from './VideoComposition';
import type { VideoCompositionProps } from './types';

// 加载本地中文字体
const fontFamily = 'Noto Sans SC';
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: '${fontFamily}';
      src: url('http://127.0.0.1:3001/assets/fonts/NotoSansSC-VariableFont_wght.ttf') format('truetype');
      font-weight: 100 900;
      font-display: swap;
    }
  `;
  document.head.appendChild(style);
}

// 默认 Props（用于预览）
const defaultProps: VideoCompositionProps = {
  shots: [
    {
      index: 1,
      scriptText: '这是第一个场景的示例文字',
      imageUrl: 'https://picsum.photos/1920/1080?random=1',
      audioUrl: '',
      durationInFrames: 72,
    },
    {
      index: 2,
      scriptText: '这是第二个场景的示例文字',
      imageUrl: 'https://picsum.photos/1920/1080?random=2',
      audioUrl: '',
      durationInFrames: 72,
    },
  ],
  fps: 24,
  width: 1920,
  height: 1080,
  enableKenBurns: true,
  kenBurnsType: 'random',
  zoomRatio: 1.12,
  panRange: 50,
  enableSubtitle: true,
  subtitlePosition: 'bottom',
  subtitleFontSize: 60,
  subtitleStrokeWidth: 6,
  enableBgm: false,
  bgmUrl: undefined,
  bgmVolume: 0.2,
  bgmFadeIn: 2,
  bgmFadeOut: 3,
  transitionDuration: 0.5,
};

// 计算总时长
const calculateTotalDuration = (props: VideoCompositionProps): number => {
  const shotsDuration = props.shots.reduce((sum, s) => sum + s.durationInFrames, 0);
  const transitionFrames = Math.round(props.transitionDuration * props.fps);
  const transitionsCount = Math.max(0, props.shots.length - 1);
  return shotsDuration - transitionsCount * transitionFrames;
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="VideoComposition"
      component={VideoComposition}
      durationInFrames={calculateTotalDuration(defaultProps)}
      fps={defaultProps.fps}
      width={defaultProps.width}
      height={defaultProps.height}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => {
        return {
          durationInFrames: calculateTotalDuration(props),
          fps: props.fps,
          width: props.width,
          height: props.height,
        };
      }}
    />
  );
};
