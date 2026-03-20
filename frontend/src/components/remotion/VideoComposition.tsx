import React from 'react';
import { AbsoluteFill, Loop, OffthreadVideo, Series } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { Scene } from './components/Scene';
import { BookAnalysisScene } from './components/BookAnalysisScene';
import { KenBurnsImage } from './components/KenBurnsImage';
import { BackgroundMusic } from './components/BackgroundMusic';
import type { VideoCompositionProps } from './types';

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  shots,
  category,
  backgroundUrl,
  backgroundType,
  backgroundVideoDurationInFrames,
  enableKenBurns,
  kenBurnsType,
  zoomRatio,
  panRange,
  enableSubtitle,
  subtitlePosition,
  subtitleFontSize,
  subtitleStrokeWidth,
  subtitleColor,
  enableBgm,
  bgmUrl,
  bgmVolume,
  bgmFadeIn,
  bgmFadeOut,
  transitionDuration,
  highlightSfxUrl,
  fps,
}) => {
  const transitionFrames = Math.round(transitionDuration * fps);
  const isBookAnalysis = category === 'book_analysis';

  // 过滤掉需要跳过的段落：无文字且无单独背景的段落
  const activeShots = shots.filter((shot) => {
    if (isBookAnalysis) {
      const hasText = !!(shot.scriptText && shot.scriptText.trim());
      if (!hasText && !shot.backgroundUrl) {
        return false;
      }
    }
    return true;
  });

  // 预计算每个场景的 globalFrameOffset
  const frameOffsets: number[] = [];
  let cumulativeOffset = 0;
  for (const shot of activeShots) {
    frameOffsets.push(cumulativeOffset);
    cumulativeOffset += shot.durationInFrames;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* 全局连续背景层：贯穿整个视频循环播放 */}
      {isBookAnalysis && backgroundUrl && (
        <AbsoluteFill>
          {backgroundType === 'video' ? (
            backgroundVideoDurationInFrames ? (
              <Loop durationInFrames={backgroundVideoDurationInFrames}>
                <OffthreadVideo
                  src={backgroundUrl}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  muted
                />
              </Loop>
            ) : (
              <OffthreadVideo
                src={backgroundUrl}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                muted
              />
            )
          ) : (
            <KenBurnsImage
              src={backgroundUrl}
              type={enableKenBurns ? kenBurnsType : 'zoom_in'}
              zoomRatio={enableKenBurns ? zoomRatio : 1}
              panRange={panRange}
            />
          )}
        </AbsoluteFill>
      )}

      {/* 场景序列 */}
      {isBookAnalysis ? (
        <Series>
          {activeShots.map((shot, index) => (
            <Series.Sequence key={shot.index} durationInFrames={shot.durationInFrames}>
              <BookAnalysisScene
                shot={shot}
                globalFrameOffset={frameOffsets[index]}
                backgroundUrl={shot.backgroundUrl}
                backgroundType={shot.backgroundType}
                enableKenBurns={enableKenBurns}
                kenBurnsType={kenBurnsType}
                zoomRatio={zoomRatio}
                panRange={panRange}
                enableSubtitle={enableSubtitle}
                subtitlePosition={subtitlePosition}
                subtitleFontSize={subtitleFontSize}
                subtitleStrokeWidth={subtitleStrokeWidth}
                subtitleColor={subtitleColor}
                highlightSfxUrl={highlightSfxUrl}
              />
            </Series.Sequence>
          ))}
        </Series>
      ) : (
        <TransitionSeries>
          {activeShots.map((shot, index) => (
            <React.Fragment key={shot.index}>
              <TransitionSeries.Sequence durationInFrames={shot.durationInFrames}>
                <Scene
                  shot={shot}
                  globalFrameOffset={frameOffsets[index]}
                  enableKenBurns={enableKenBurns}
                  kenBurnsType={kenBurnsType}
                  zoomRatio={zoomRatio}
                  panRange={panRange}
                  enableSubtitle={enableSubtitle}
                  subtitlePosition={subtitlePosition}
                  subtitleFontSize={subtitleFontSize}
                  subtitleStrokeWidth={subtitleStrokeWidth}
                  subtitleColor={subtitleColor}
                />
              </TransitionSeries.Sequence>
              {index < activeShots.length - 1 && (
                <TransitionSeries.Transition
                  presentation={fade()}
                  timing={linearTiming({ durationInFrames: transitionFrames })}
                />
              )}
            </React.Fragment>
          ))}
        </TransitionSeries>
      )}

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
