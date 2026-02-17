import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/NotoSansSC';
import type { SubtitlePosition, SubtitleTimestamp } from '../types';

// 加载中文字体
const { fontFamily } = loadFont();

type Props = {
  text: string;
  durationInFrames: number;
  globalFrameOffset?: number;
  position?: SubtitlePosition;
  fontSize?: number;
  strokeWidth?: number;
  color?: string;
  subtitleTimestamps?: SubtitleTimestamp[];
};

export const Subtitle: React.FC<Props> = ({
  text,
  durationInFrames,
  globalFrameOffset = 0,
  position = 'bottom',
  fontSize = 60,
  strokeWidth = 6,
  color = 'white',
  subtitleTimestamps,
}) => {
  const { height, fps } = useVideoConfig();
  const globalFrame = useCurrentFrame();
  const frame = globalFrame - globalFrameOffset;

  const positionStyle = getPositionStyle(position, height);
  const sentences = splitBySentence(text);

  // 优先使用 TTS 时间戳精确同步，回退到加权字符模型
  const currentSentence = stripPunctuation(
    subtitleTimestamps && subtitleTimestamps.length > 0
      ? getCurrentSentenceByTimestampDirect(frame, fps, subtitleTimestamps)
      : getCurrentSentenceWeighted(sentences, frame, durationInFrames),
  );

  return (
    <AbsoluteFill style={positionStyle}>
      <div
        style={{
          fontFamily,
          fontSize,
          fontWeight: 'bold',
          color,
          textShadow: generateTextShadow(strokeWidth),
          textAlign: 'center',
          width: '100%',
          lineHeight: 1.4,
          padding: '0 5%',
        }}
      >
        {currentSentence}
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
      return { ...base, alignItems: 'flex-start', paddingTop: height * 0.65 };
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

function stripPunctuation(s: string): string {
  return s.replace(/[，。！？；、,\.!\?;]+$/g, '');
}

function splitBySentence(text: string): string[] {
  const parts = text.split(/(?<=[，。！？；、,\.!\?;])/);
  return parts.filter((s) => s.length > 0);
}

/**
 * 直接使用 TTS 时间戳文本显示字幕
 * 与后端渲染器保持一致的算法
 */
function getCurrentSentenceByTimestampDirect(
  frame: number,
  fps: number,
  timestamps: SubtitleTimestamp[],
): string {
  const currentMs = (frame / fps) * 1000;

  // 找到当前时间对应的时间戳条目
  for (const ts of timestamps) {
    if (currentMs >= ts.startMs && currentMs < ts.endMs) {
      return ts.text;
    }
  }

  // 如果当前时间超过所有时间戳，返回最后一个
  if (timestamps.length > 0 && currentMs >= timestamps[timestamps.length - 1].endMs) {
    return timestamps[timestamps.length - 1].text;
  }

  // 如果当前时间在第一个时间戳之前，返回空字符串
  return '';
}

/**
 * 加权字符模型：为标点符号分配额外时间权重，模拟 TTS 停顿
 */
function getCurrentSentenceWeighted(
  sentences: string[],
  frame: number,
  durationInFrames: number,
): string {
  if (sentences.length === 0) return '';
  if (sentences.length === 1) return sentences[0];

  const weights = sentences.map((s) => {
    let weight = s.length;
    const lastChar = s.trim().slice(-1);
    if ('。！？'.includes(lastChar)) {
      weight += 4;
    } else if ('；;'.includes(lastChar)) {
      weight += 3;
    } else if ('，、,'.includes(lastChar)) {
      weight += 1.5;
    }
    return weight;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const progress = Math.min(frame / Math.max(durationInFrames - 1, 1), 1);
  const targetWeight = progress * totalWeight;

  let cumulative = 0;
  for (let i = 0; i < sentences.length; i++) {
    cumulative += weights[i];
    if (targetWeight < cumulative) return sentences[i];
  }
  return sentences[sentences.length - 1];
}
