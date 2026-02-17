// 字幕时间戳条目（来自 TTS API）
export type SubtitleTimestamp = {
  text: string;
  startMs: number;
  endMs: number;
};

// 单个镜头数据
export type Shot = {
  index: number;
  scriptText: string;
  imageUrl: string;
  audioUrl: string;
  durationInFrames: number;
  backgroundUrl?: string;
  backgroundType?: 'image' | 'video';
  backgroundVideoDurationInFrames?: number;  // 背景视频原始时长（帧）
  highlightText?: string;  // 重点标注文字
  highlightSfxUrl?: string;  // 该段落自定义重点标注音效 URL
  subtitleTimestamps?: SubtitleTimestamp[];  // TTS 返回的字幕时间戳
};

// 项目分类
export type ProjectCategory = 'emotion' | 'book_analysis';

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
  // 项目分类
  category?: ProjectCategory;
  // 全局背景（读书解析模式）
  backgroundUrl?: string;
  backgroundType?: 'image' | 'video';
  backgroundVideoDurationInFrames?: number;  // 全局背景视频原始时长（帧），用于循环
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
  subtitleColor: string;
  // BGM
  enableBgm: boolean;
  bgmUrl?: string;
  bgmVolume: number;
  bgmFadeIn: number;
  bgmFadeOut: number;
  // 转场
  transitionDuration: number;
  // 重点文字音效
  highlightSfxUrl?: string;
};
