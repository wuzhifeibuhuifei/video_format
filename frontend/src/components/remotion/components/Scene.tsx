import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import type { Shot, KenBurnsType, SubtitlePosition } from '../types';
import { KenBurnsImage } from './KenBurnsImage';
import { Subtitle } from './Subtitle';


type SceneProps = {
  shot: Shot;
  globalFrameOffset: number;
  enableKenBurns: boolean;
  kenBurnsType: KenBurnsType;
  zoomRatio: number;
  panRange: number;
  enableSubtitle: boolean;
  subtitlePosition: SubtitlePosition;
  subtitleFontSize: number;
  subtitleStrokeWidth: number;
  subtitleColor: string;

};

export const Scene: React.FC<SceneProps> = ({
  shot,
  globalFrameOffset,
  enableKenBurns,
  kenBurnsType,
  zoomRatio,
  panRange,
  enableSubtitle,
  subtitlePosition,
  subtitleFontSize,
  subtitleStrokeWidth,
  subtitleColor,

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
          durationInFrames={shot.durationInFrames}
          globalFrameOffset={globalFrameOffset}
          position={subtitlePosition}
          fontSize={subtitleFontSize}
          strokeWidth={subtitleStrokeWidth}
          color={subtitleColor}
          subtitleTimestamps={shot.subtitleTimestamps}
        />
      )}

      {/* 场景音频 */}
      {shot.audioUrl && <Audio src={shot.audioUrl} />}
    </AbsoluteFill>
  );
};
