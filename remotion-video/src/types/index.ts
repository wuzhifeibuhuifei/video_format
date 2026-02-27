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
  videoUrl?: string | null;  // AI 生成的分段视频 URL
  audioUrl: string;
  durationInFrames: number;
  backgroundUrl?: string;
  backgroundType?: 'image' | 'video';
  backgroundVideoDurationInFrames?: number;  // 背景视频原始时长（帧）
  highlightText?: string;  // 重点标注文字
  highlightSfxUrl?: string;  // 该段落自定义重点标注音效 URL
  subtitleTimestamps?: SubtitleTimestamp[];  // TTS 返回的字幕时间戳
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

// 项目分类
export type ProjectCategory = 'emotion' | 'book_analysis';

// 图片叠加视频 Props（工具类）
export type ImageOverlayVideoProps = {
  videoSrc: string;           // 背景视频路径
  imageSrc: string;           // 叠加图片路径
  fps: number;                // 帧率
  width: number;              // 视频宽度
  height: number;             // 视频高度
  durationInFrames: number;   // 总时长（帧）
  initialScale: number;       // 图片初始缩放比例（0.5 = 50%）
  finalScale: number;         // 放大后的最终缩放比例
  initialX: number;           // 初始 X 位置（百分比 0-100，50=居中）
  initialY: number;           // 初始 Y 位置（百分比 0-100，50=居中）
  targetX: number;            // 移动目标 X 位置（百分比）
  targetY: number;            // 移动目标 Y 位置（百分比）
  moveStartFrame: number;     // 开始移动的帧
  moveDurationFrames: number; // 移动动画持续帧数
  scaleDurationFrames: number;// 放大动画持续帧数（移动结束后开始）
  imageWidth: number;         // 图片显示宽度（px）
  imageHeight: number;        // 图片显示高度（px）
};

// 书籍揭示视频 Props
export type BookRevealProps = {
  videoSrc: string;
  imageSrc: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
};

// 书籍卡片 Props
export type BookCardProps = {
  imageSrc: string;
  backgroundSrc?: string;
  bookName: string;
  subtitle?: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
};

// 视频合成 Props
export type VideoCompositionProps = {
  shots: Shot[];
  fps: number;
  width: number;
  height: number;
  // 项目分类与背景
  category?: ProjectCategory;
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
