import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const fontFamily = 'Noto Sans SC';

type Props = {
  text: string;
  scriptText: string;
  durationInFrames: number;
  globalFrameOffset?: number;
  sfxUrl?: string;
  fontSize?: number;
  color?: string;
};

export const HighlightText: React.FC<Props> = ({
  text,
  scriptText,
  durationInFrames,
  globalFrameOffset = 0,
  sfxUrl,
  fontSize = 120,
  color = '#FFD700',
}) => {
  const items = text.split('|').map((t) => t.trim()).filter((t) => t.length > 0);

  return (
    <>
      {items.map((item, i) => (
        <SingleHighlight
          key={i}
          text={item}
          scriptText={scriptText}
          durationInFrames={durationInFrames}
          globalFrameOffset={globalFrameOffset}
          sfxUrl={sfxUrl}
          fontSize={fontSize}
          color={color}
        />
      ))}
    </>
  );
};

const SingleHighlight: React.FC<Props> = ({
  text,
  scriptText,
  durationInFrames,
  globalFrameOffset = 0,
  sfxUrl,
  fontSize = 120,
  color = '#FFD700',
}) => {
  const { fps } = useVideoConfig();
  const globalFrame = useCurrentFrame();
  const frame = globalFrame - globalFrameOffset;

  const { startFrame, endFrame } = getHighlightFrameRange(
    text,
    scriptText,
    durationInFrames,
    fps,
  );

  const displayDuration = endFrame - startFrame;
  const isVisible = frame >= startFrame && frame < endFrame;

  if (!isVisible) return null;

  const localFrame = frame - startFrame;

  const scale = spring({
    frame: localFrame,
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.8 },
  });

  const fadeOutStart = displayDuration - Math.round(fps * 0.3);
  const opacity =
    localFrame >= fadeOutStart
      ? Math.max(0, 1 - (localFrame - fadeOutStart) / (displayDuration - fadeOutStart))
      : 1;

  return (
    <>
      <AbsoluteFill
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize,
            fontWeight: 900,
            color,
            textShadow: generateGlow(color),
            textAlign: 'center',
            transform: `scale(${scale})`,
            opacity,
            padding: '0 8%',
            lineHeight: 1.3,
          }}
        >
          {text.split(/(?<=[，。！？；、：,\.!\?;:])/).map((seg, i) => (
            <React.Fragment key={i}>{i > 0 && <br />}{seg}</React.Fragment>
          ))}
        </div>
      </AbsoluteFill>

      {sfxUrl && (
        <Sequence from={startFrame} durationInFrames={Math.min(displayDuration, Math.round(fps * 3))}>
          <Audio src={sfxUrl} volume={0.6} />
        </Sequence>
      )}
    </>
  );
};

function generateGlow(color: string): string {
  return [
    `0 0 10px ${color}`,
    `0 0 20px ${color}80`,
    `0 0 40px ${color}40`,
    `-2px -2px 0 #000`,
    `2px -2px 0 #000`,
    `-2px 2px 0 #000`,
    `2px 2px 0 #000`,
  ].join(', ');
}

function getHighlightFrameRange(
  highlightText: string,
  scriptText: string,
  durationInFrames: number,
  fps: number,
): { startFrame: number; endFrame: number } {
  const sentences = splitBySentence(scriptText);

  // 使用加权模型计算每个句子的时间占比
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

  let cumWeight = 0;
  let sentenceStart = 0;
  let sentenceEnd = durationInFrames;

  for (let i = 0; i < sentences.length; i++) {
    const sentStartFrac = cumWeight / totalWeight;
    cumWeight += weights[i];
    const sentEndFrac = cumWeight / totalWeight;

    if (sentences[i].includes(highlightText)) {
      sentenceStart = Math.round(sentStartFrac * durationInFrames);
      sentenceEnd = Math.round(sentEndFrac * durationInFrames);
      break;
    }
  }

  const displayFrames = Math.round(fps * 2);
  const endFrame = Math.min(sentenceStart + displayFrames, durationInFrames);

  return { startFrame: sentenceStart, endFrame };
}

function splitBySentence(text: string): string[] {
  const parts = text.split(/(?<=[，。！？；、：,\.!\?;:])/);
  return parts.filter((s) => s.length > 0);
}
