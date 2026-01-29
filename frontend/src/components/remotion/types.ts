// 单个镜头数据
export type Shot = {
  index: number;
  scriptText: string;
  imageUrl: string;
  audioUrl: string;
  durationInFrames: number;
};

// Ken Burns 运动类型
export type KenBurnsType =
  | 'zoom_in'
  | 'zoom_out'
  | 'pan_left'
  | 'pan_right'
  | 'pan_up'
  | 'pan_down'
  | 'random';

// 字幕位置
export type SubtitlePosition = 'top' | 'center' | 'bottom';

// 视频合成 Props
export type VideoCompositionProps = {
  shots: Shot[];
  fps: number;
  width: number;
  height: number;
  // Ken Burns 效果
  enableKenBurns: boolean;
  kenBurnsType: KenBurnsType;
  zoomRatio: number;
  panRange: number;
  // 字幕
  enableSubtitle: boolean;
  subtitlePosition: SubtitlePosition;
  subtitleFontSize: number;
  subtitleStrokeWidth: number;
  // BGM
  enableBgm: boolean;
  bgmUrl?: string;
  bgmVolume: number;
  bgmFadeIn: number;
  bgmFadeOut: number;
  // 转场
  transitionDuration: number;
};
