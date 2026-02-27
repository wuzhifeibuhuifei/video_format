import React from 'react';
import { Composition, staticFile } from 'remotion';
import { VideoComposition } from './VideoComposition';
import { ImageOverlayVideo } from './components/ImageOverlayVideo';
import { BookReveal } from './components/BookReveal';
import { BookCard } from './components/BookCard';
import { BookCardVertical } from './components/BookCardVertical';
import type { VideoCompositionProps, ImageOverlayVideoProps, BookRevealProps, BookCardProps } from './types';

// 加载本地中文字体
const fontFamily = 'Noto Sans SC';
const fontUrl = staticFile('fonts/NotoSansSC-VariableFont_wght.ttf');

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: '${fontFamily}';
      src: url('${fontUrl}') format('truetype');
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
  subtitleFontSize: 40,
  subtitleStrokeWidth: 6,
  subtitleColor: '#f6fa00',
  enableBgm: false,
  bgmUrl: undefined,
  bgmVolume: 0.2,
  bgmFadeIn: 2,
  bgmFadeOut: 3,
  transitionDuration: 0.5,
};

// 过滤活跃段落（与 VideoComposition 中的 activeShots 逻辑保持一致）
const getActiveShots = (props: VideoCompositionProps) => {
  const isBookAnalysis = props.category === 'book_analysis';
  return props.shots.filter((shot) => {
    if (isBookAnalysis) {
      const hasText = !!(shot.scriptText && shot.scriptText.trim());
      if (!hasText && !shot.backgroundUrl) {
        return false;
      }
    }
    return true;
  });
};

// 计算总时长
const calculateTotalDuration = (props: VideoCompositionProps): number => {
  const active = getActiveShots(props);
  const shotsDuration = active.reduce((sum, s) => sum + s.durationInFrames, 0);
  const isBookAnalysis = props.category === 'book_analysis';
  if (isBookAnalysis) {
    return shotsDuration;
  }
  const transitionFrames = Math.round(props.transitionDuration * props.fps);
  const transitionsCount = Math.max(0, active.length - 1);
  return shotsDuration - transitionsCount * transitionFrames;
};

// ImageOverlayVideo 默认 Props
const imageOverlayDefaultProps: ImageOverlayVideoProps = {
  videoSrc: '',
  imageSrc: '',
  fps: 24,
  width: 1920,
  height: 1080,
  durationInFrames: 240,
  initialScale: 0.5,
  finalScale: 1.0,
  initialX: 80,
  initialY: 30,
  targetX: 50,
  targetY: 50,
  moveStartFrame: 24,
  moveDurationFrames: 4,
  scaleDurationFrames: 212,
  imageWidth: 400,
  imageHeight: 300,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
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
      <Composition
        id="ImageOverlayVideo"
        component={ImageOverlayVideo}
        durationInFrames={imageOverlayDefaultProps.durationInFrames}
        fps={imageOverlayDefaultProps.fps}
        width={imageOverlayDefaultProps.width}
        height={imageOverlayDefaultProps.height}
        defaultProps={imageOverlayDefaultProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.durationInFrames,
          fps: props.fps,
          width: props.width,
          height: props.height,
        })}
      />
      <Composition
        id="BookReveal"
        component={BookReveal}
        durationInFrames={64}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{
          videoSrc: '',
          imageSrc: '',
          fps: 30,
          width: 1280,
          height: 720,
          durationInFrames: 64,
        } as BookRevealProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.durationInFrames,
          fps: props.fps,
          width: props.width,
          height: props.height,
        })}
      />
      <Composition
        id="BookCard"
        component={BookCard}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          imageSrc: '',
          backgroundSrc: undefined,
          bookName: '示例书名',
          subtitle: '',
          fps: 30,
          width: 1920,
          height: 1080,
          durationInFrames: 1,
        } as BookCardProps}
      />
      <Composition
        id="BookCardVertical"
        component={BookCardVertical}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          imageSrc: '',
          backgroundSrc: undefined,
          bookName: '示例书名',
          subtitle: '',
          fps: 30,
          width: 1080,
          height: 1920,
          durationInFrames: 1,
        } as BookCardProps}
      />
    </>
  );
};
