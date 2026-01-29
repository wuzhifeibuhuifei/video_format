import React from 'react';
import { AbsoluteFill } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { Scene } from './components/Scene';
import { BackgroundMusic } from './components/BackgroundMusic';
import type { VideoCompositionProps } from './types';

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  shots,
  enableKenBurns,
  kenBurnsType,
  zoomRatio,
  panRange,
  enableSubtitle,
  subtitlePosition,
  subtitleFontSize,
  subtitleStrokeWidth,
  enableBgm,
  bgmUrl,
  bgmVolume,
  bgmFadeIn,
  bgmFadeOut,
  transitionDuration,
  fps,
}) => {
  const transitionFrames = Math.round(transitionDuration * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* 场景序列 */}
      <TransitionSeries>
        {shots.map((shot, index) => (
          <React.Fragment key={shot.index}>
            <TransitionSeries.Sequence durationInFrames={shot.durationInFrames}>
              <Scene
                shot={shot}
                enableKenBurns={enableKenBurns}
                kenBurnsType={kenBurnsType}
                zoomRatio={zoomRatio}
                panRange={panRange}
                enableSubtitle={enableSubtitle}
                subtitlePosition={subtitlePosition}
                subtitleFontSize={subtitleFontSize}
                subtitleStrokeWidth={subtitleStrokeWidth}
              />
            </TransitionSeries.Sequence>
            {index < shots.length - 1 && (
              <TransitionSeries.Transition
                presentation={fade()}
                timing={linearTiming({ durationInFrames: transitionFrames })}
              />
            )}
          </React.Fragment>
        ))}
      </TransitionSeries>

      {/* BGM */}
      {enableBgm && bgmUrl && (
        <BackgroundMusic
          src={bgmUrl}
          volume={bgmVolume}
          fadeIn={bgmFadeIn}
          fadeOut={bgmFadeOut}
        />
      )}
    </AbsoluteFill>
  );
};
