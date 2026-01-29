import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import type { Shot, KenBurnsType, SubtitlePosition } from '../types';
import { KenBurnsImage } from './KenBurnsImage';
import { Subtitle } from './Subtitle';

type SceneProps = {
  shot: Shot;
  enableKenBurns: boolean;
  kenBurnsType: KenBurnsType;
  zoomRatio: number;
  panRange: number;
  enableSubtitle: boolean;
  subtitlePosition: SubtitlePosition;
  subtitleFontSize: number;
  subtitleStrokeWidth: number;
};

export const Scene: React.FC<SceneProps> = ({
  shot,
  enableKenBurns,
  kenBurnsType,
  zoomRatio,
  panRange,
  enableSubtitle,
  subtitlePosition,
  subtitleFontSize,
  subtitleStrokeWidth,
}) => {
  return (
    <AbsoluteFill>
      {/* 背景图片 + Ken Burns 效果 */}
      <KenBurnsImage
        src={shot.imageUrl}
        type={enableKenBurns ? kenBurnsType : 'zoom_in'}
        zoomRatio={enableKenBurns ? zoomRatio : 1}
        panRange={panRange}
      />

      {/* 字幕 */}
      {enableSubtitle && (
        <Subtitle
          text={shot.scriptText}
          position={subtitlePosition}
          fontSize={subtitleFontSize}
          strokeWidth={subtitleStrokeWidth}
        />
      )}

      {/* 场景音频 */}
      {shot.audioUrl && <Audio src={shot.audioUrl} />}
    </AbsoluteFill>
  );
};
