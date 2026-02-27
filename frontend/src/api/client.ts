const API_BASE = '/api';

// 认证管理
const AUTH_KEY = 'video_auth';

export function getAuthHeader(): string | null {
  return localStorage.getItem(AUTH_KEY);
}

export function setAuth(username: string, password: string): void {
  const credentials = btoa(`${username}:${password}`);
  localStorage.setItem(AUTH_KEY, `Basic ${credentials}`);
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY);
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem(AUTH_KEY);
}

// 带认证的 fetch 包装
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const authHeader = getAuthHeader();
  const headers = new Headers(options.headers);

  if (authHeader) {
    headers.set('Authorization', authHeader);
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('认证失败，请重新登录');
  }

  return res;
}

// 类型定义
export interface Project {
  id: number;
  theme: string;
  style: string;
  aspect_ratio: string;
  scene_count: number;
  status: string;
  created_at: string;
  video_path?: string;
  subtitle_path?: string;
  video_with_subtitles_path?: string;
  shots?: Shot[];
  config?: ProjectConfig;
  preview_text?: string;
  character_image?: string;
  category?: 'emotion' | 'book_analysis';
  background_type?: 'image' | 'video';
  background_path?: string;
}

export interface Shot {
  id: number;
  display_index: number;
  script_text: string;
  image_prompt: string;
  negative_prompt: string;
  image_path: string;
  audio_path?: string;
  subtitle_path?: string;
  voice_id?: string;
  video_prompt?: string;
  video_path?: string;
  video_status?: 'pending' | 'generating' | 'completed' | 'failed';
  background_path?: string;
  background_type?: 'image' | 'video';
  highlight_text?: string;
  highlight_sfx_path?: string;
}

export interface ProjectConfig {
  image_style?: string;
  negative_prompt?: string;
  enable_subtitle?: boolean;
  subtitle_font_size?: number;
  subtitle_color?: string;
  voice_setting?: VoiceSetting;
  video_effects?: VideoEffects;
  audio_effects?: AudioEffects;
  audio_effects_config?: AudioEffects;
  timing?: TimingConfig;
}

export interface VoiceSetting {
  voice_id?: string;
  speed?: number;
  vol?: number;
  pitch?: number;
}

export interface VideoEffects {
  enable_movement?: boolean;
  movement_type?: string;
  zoom_ratio?: number;
}

export interface AudioEffects {
  enable_bgm?: boolean;
  bgm_volume?: number;
}

export interface TimingConfig {
  min_duration?: number;
  max_duration?: number;
  transition_duration?: number;
}

export interface SystemConfigPayload {
  image: { model: string; apiKey: string; enable: boolean };
  video: { model: string; apiKey: string; enable: boolean };
  tts: {
    voiceId: string;
    apiKey: string;
    model: string;
    speed: number;
    vol: number;
  };
  videoEffects?: {
    enableMovement: boolean;
    movementType: string;
    zoomRatio: number;
    panXRange: number;
    panYRange: number;
    enableSubtitle: boolean;
  };
  audioEffects?: {
    enableBgm: boolean;
    bgmVolume: number;
    bgmLoop: boolean;
    bgmFadein: number;
    bgmFadeout: number;
  };
  timing?: {
    baseDuration: number;
    charsPerSecond: number;
    minDuration: number;
    maxDuration: number;
    transitionDuration: number;
  };
}

export interface CreateProjectRequest {
  theme?: string;
  style?: string;
  image_style?: string;
  negative_prompt?: string;
  scene_count?: number;
  aspect_ratio?: string;
  voice_setting?: VoiceSetting;
  insight_text?: string;
  skip_insight?: boolean;
  enable_subtitle?: boolean;
  video_effects?: VideoEffects;
  audio_effects?: AudioEffects;
  timing?: TimingConfig;
  category?: 'emotion' | 'book_analysis';
}

// 获取系统默认配置
export async function fetchConfig(): Promise<{
  default_image_style: string;
  default_story_tone: string;
  default_scene_count: number;
  enable_bgm: boolean;
}> {
  const res = await authFetch(`${API_BASE}/config`);
  if (!res.ok) throw new Error('获取配置失败');
  return res.json();
}

// API 函数
export async function fetchProjects(): Promise<Project[]> {
  const res = await authFetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error('获取项目列表失败');
  const data = await res.json();
  return data.projects || [];
}

export async function fetchProject(id: number): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${id}`);
  if (!res.ok) throw new Error('获取项目详情失败');
  return res.json();
}

export async function createProject(data: CreateProjectRequest): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '创建项目失败' }));
    throw new Error(err.detail || '创建项目失败');
  }
  return res.json();
}

export async function updateShots(projectId: number, shots: Shot[]): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/shots`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shots }),
  });
  if (!res.ok) throw new Error('更新镜头失败');
  return res.json();
}

export async function addShot(
  projectId: number,
  scriptText: string,
  afterIndex?: number
): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/shots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script_text: scriptText, after_index: afterIndex }),
  });
  if (!res.ok) throw new Error('添加段落失败');
  return res.json();
}

export async function duplicateShot(projectId: number, shotId: number): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/shots/${shotId}/duplicate`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('复制段落失败');
  return res.json();
}

export async function deleteShot(projectId: number, shotId: number): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/shots/${shotId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除段落失败');
  return res.json();
}

// 更新项目配置
export async function updateProjectConfig(
  projectId: number,
  config: {
    aspect_ratio?: string;
    enable_subtitle?: boolean;
    subtitle_font_size?: number;
    subtitle_color?: string;
    audio_effects?: { enable_bgm?: boolean; bgm_volume?: number };
    video_effects?: Record<string, unknown>;
    timing?: Record<string, unknown>;
  }
): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '更新配置失败' }));
    throw new Error(err.detail || '更新配置失败');
  }
  return res.json();
}

export async function deleteProject(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/projects/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除项目失败');
}

export async function generateImages(projectId: number, missingOnly = true): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/images?missing_only=${missingOnly}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('生成图片失败');
  return res.json();
}

export async function regenerateShotImage(projectId: number, shotId: number): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/shots/${shotId}/image`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('重新生成图片失败');
  return res.json();
}

export async function uploadShotImage(projectId: number, shotId: number, file: File): Promise<Project> {
  const formData = new FormData();
  formData.append('image', file);

  const authHeader = getAuthHeader();
  const headers: HeadersInit = {};
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const res = await fetch(`${API_BASE}/projects/${projectId}/shots/${shotId}/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (res.status === 401) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('认证失败，请重新登录');
  }
  if (!res.ok) throw new Error('上传图片失败');
  return res.json();
}

export async function uploadShotBackground(projectId: number, shotId: number, file: File): Promise<Project> {
  const formData = new FormData();
  formData.append('file', file);

  const authHeader = getAuthHeader();
  const headers: HeadersInit = {};
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const res = await fetch(`${API_BASE}/projects/${projectId}/shots/${shotId}/background`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (res.status === 401) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('认证失败，请重新登录');
  }
  if (!res.ok) throw new Error('上传段落背景失败');
  return res.json();
}

export async function setShotBackgroundFromAsset(projectId: number, shotId: number, filePath: string): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/shots/${shotId}/background-from-asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath }),
  });
  if (!res.ok) throw new Error('设置段落背景失败');
  return res.json();
}

export async function deleteShotBackground(projectId: number, shotId: number): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/shots/${shotId}/background`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除段落背景失败');
  return res.json();
}

export async function uploadShotHighlightSfx(projectId: number, shotId: number, file: File): Promise<Project> {
  const formData = new FormData();
  formData.append('file', file);

  const authHeader = getAuthHeader();
  const headers: HeadersInit = {};
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const res = await fetch(`${API_BASE}/projects/${projectId}/shots/${shotId}/highlight-sfx`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (res.status === 401) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('认证失败，请重新登录');
  }
  if (!res.ok) throw new Error('上传重点标注音效失败');
  return res.json();
}

export async function deleteShotHighlightSfx(projectId: number, shotId: number): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/shots/${shotId}/highlight-sfx`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除重点标注音效失败');
  return res.json();
}

export async function setShotHighlightSfxFromAsset(projectId: number, shotId: number, filePath: string): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/shots/${shotId}/highlight-sfx-from-asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath }),
  });
  if (!res.ok) throw new Error('设置音效失败');
  return res.json();
}

export async function confirmProject(id: number): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${id}/confirm`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('渲染失败');
  return res.json();
}

export async function burnSubtitles(
  id: number,
  options?: {
    fontSize?: number;
    fontColor?: string;
    position?: 'top' | 'bottom';
  }
): Promise<{ success: boolean; videoPath: string }> {
  const res = await authFetch(`${API_BASE}/projects/${id}/burn-subtitles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  if (!res.ok) throw new Error('字幕烧录失败');
  return res.json();
}

export async function generateAndBurnSubtitles(
  id: number,
  options?: {
    fontSize?: number;
    fontColor?: string;
    position?: 'top' | 'bottom';
  }
): Promise<{ success: boolean; videoPath: string }> {
  const res = await authFetch(`${API_BASE}/projects/${id}/generate-and-burn-subtitles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || '字幕生成与烧录失败');
  }
  return res.json();
}

export async function fetchRemotionProps(id: number) {
  const res = await authFetch(`${API_BASE}/projects/${id}/remotion-props`);
  if (!res.ok) throw new Error('获取预览数据失败');
  return res.json();
}

export async function exportProject(id: number) {
  const res = await authFetch(`${API_BASE}/projects/${id}/export`);
  if (!res.ok) throw new Error('导出项目失败');
  return res.json();
}

export interface TaskProgress {
  current: number;
  total: number;
  stage: string;
  message: string;
  percent: number;
}

export interface ProgressResponse {
  status: 'idle' | 'running';
  progress: TaskProgress | null;
}

export async function fetchProgress(projectId: number): Promise<ProgressResponse> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/progress`);
  if (!res.ok) throw new Error('获取进度失败');
  return res.json();
}

// 视频生成相关 API
export async function generateVideoPrompt(
  projectId: number,
  shotId: number
): Promise<{ video_prompt: string }> {
  const res = await authFetch(
    `${API_BASE}/projects/${projectId}/shots/${shotId}/video-prompt`,
    { method: 'POST' }
  );
  if (!res.ok) throw new Error('生成视频提示词失败');
  return res.json();
}

export async function generateShotVideo(
  projectId: number,
  shotId: number,
  prompt?: string
): Promise<Project> {
  const res = await authFetch(
    `${API_BASE}/projects/${projectId}/shots/${shotId}/video`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    }
  );
  if (!res.ok) throw new Error('生成视频失败');
  return res.json();
}

export async function updateShotVideoPrompt(
  projectId: number,
  shotId: number,
  videoPrompt: string
): Promise<Project> {
  const res = await authFetch(
    `${API_BASE}/projects/${projectId}/shots/${shotId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_prompt: videoPrompt }),
    }
  );
  if (!res.ok) throw new Error('更新视频提示词失败');
  return res.json();
}

// 画面风格相关
export interface ImageStyle {
  id: number;
  name: string;
  prompt: string;
  negative_prompt: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export async function fetchImageStyles(): Promise<ImageStyle[]> {
  const res = await authFetch(`${API_BASE}/image-styles`);
  if (!res.ok) throw new Error('获取画面风格列表失败');
  const data = await res.json();
  return data.styles || [];
}

export async function createImageStyle(data: {
  name: string;
  prompt: string;
  negative_prompt?: string;
  is_default?: boolean;
}): Promise<ImageStyle> {
  const res = await authFetch(`${API_BASE}/image-styles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('创建画面风格失败');
  return res.json();
}

export async function updateImageStyle(
  id: number,
  data: Partial<{ name: string; prompt: string; negative_prompt: string; is_default: boolean }>
): Promise<ImageStyle> {
  const res = await authFetch(`${API_BASE}/image-styles/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('更新画面风格失败');
  return res.json();
}

export async function deleteImageStyle(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/image-styles/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除画面风格失败');
}

// 角色形象相关
export async function uploadCharacterImage(projectId: number, file: File): Promise<Project> {
  const formData = new FormData();
  formData.append('image', file);

  const authHeader = getAuthHeader();
  const headers: HeadersInit = {};
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const res = await fetch(`${API_BASE}/projects/${projectId}/character-image`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (res.status === 401) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('认证失败，请重新登录');
  }
  if (!res.ok) throw new Error('上传角色形象失败');
  return res.json();
}

export async function deleteCharacterImage(projectId: number): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/character-image`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除角色形象失败');
  return res.json();
}

// 读书解析背景上传
export async function uploadBackground(projectId: number, file: File): Promise<Project> {
  const formData = new FormData();
  formData.append('file', file);

  const authHeader = getAuthHeader();
  const headers: HeadersInit = {};
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const res = await fetch(`${API_BASE}/projects/${projectId}/background`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (res.status === 401) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('认证失败，请重新登录');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '上传背景失败' }));
    throw new Error(err.error || '上传背景失败');
  }
  return res.json();
}

export async function deleteBackground(projectId: number): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/background`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除背景失败');
  return res.json();
}

export async function setBackgroundFromAsset(projectId: number, filePath: string): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/background-from-asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath }),
  });
  if (!res.ok) throw new Error('设置背景失败');
  return res.json();
}

// 资产相关类型
export interface AssetInfo {
  path: string;
  size: number;
  exists: boolean;
  shotIndex?: number;
  shotId?: number;
}

export interface AssetSummary {
  count: number;
  totalSize: number;
}

export interface ProjectAssets {
  assets: {
    images: AssetInfo[];
    audios: AssetInfo[];
    videos: AssetInfo[];
    characterImage: AssetInfo | null;
    finalVideo: AssetInfo | null;
    subtitleFile: AssetInfo | null;
    subtitledVideo: AssetInfo | null;
  };
  summary: {
    images: AssetSummary;
    audios: AssetSummary;
    videos: AssetSummary;
    characterImage: AssetSummary;
    finalVideo: AssetSummary;
    subtitleFile: AssetSummary;
    subtitledVideo: AssetSummary;
    total: AssetSummary;
  };
}

export async function fetchProjectAssets(projectId: number): Promise<ProjectAssets> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/assets`);
  if (!res.ok) throw new Error('获取项目资产失败');
  return res.json();
}

// 删除单个 shot 的指定资源（image / audio / video）
export async function deleteShotAsset(
  projectId: number,
  shotId: number,
  assetType: 'image' | 'audio' | 'video'
): Promise<Project> {
  const res = await authFetch(
    `${API_BASE}/projects/${projectId}/shots/${shotId}/asset/${assetType}`,
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error('删除资源失败');
  return res.json();
}

// 批量清理项目资源（按类型或全部）
export async function cleanProjectAssets(
  projectId: number,
  type?: 'images' | 'audios' | 'videos' | 'all'
): Promise<{ success: boolean; deletedCount: number; project: Project }> {
  const query = type ? `?type=${type}` : '?type=all';
  const res = await authFetch(
    `${API_BASE}/projects/${projectId}/assets${query}`,
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error('清理资源失败');
  return res.json();
}

export async function fetchSystemConfig(): Promise<SystemConfigPayload> {
  const res = await authFetch(`${API_BASE}/settings/system-config`);
  if (!res.ok) throw new Error('Failed to load system config');
  return res.json();
}

export async function updateSystemConfig(data: SystemConfigPayload): Promise<SystemConfigPayload> {
  const res = await authFetch(`${API_BASE}/settings/system-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update system config');
  return res.json();
}

export async function resetSystemConfig(): Promise<SystemConfigPayload> {
  const res = await authFetch(`${API_BASE}/settings/reset-config`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to reset system config');
  return res.json();
}

export async function testApiConnection(
  type: 'image' | 'video' | 'tts',
  apiKey: string,
  model?: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const res = await authFetch(`${API_BASE}/settings/test-api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, apiKey, model }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API test failed');
  return data;
}

// 生成随机视频主题
export async function generateRandomTheme(excludedThemes?: string[]): Promise<{
  title: string;
  description: string;
  tags: string[];
}> {
  const res = await authFetch(`${API_BASE}/projects/generate-theme`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ excludedThemes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '生成主题失败' }));
    throw new Error(err.detail || '生成主题失败');
  }
  const data = await res.json();
  return data.theme;
}

// ========== 书籍揭示视频 API ==========
export async function uploadBookCover(file: File): Promise<{ success: boolean; path: string }> {
  const formData = new FormData();
  formData.append('image', file);
  const authHeader = getAuthHeader();
  const headers: HeadersInit = {};
  if (authHeader) headers['Authorization'] = authHeader;
  const res = await fetch(`${API_BASE}/projects/book-reveal/upload-cover`, {
    method: 'POST', headers, body: formData,
  });
  if (!res.ok) throw new Error('上传封面失败');
  return res.json();
}

export async function generateBookCover(prompt: string): Promise<{ success: boolean; path: string }> {
  const res = await authFetch(`${API_BASE}/projects/book-reveal/generate-cover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error('生成封面失败');
  return res.json();
}

export async function renderBookReveal(coverPath: string): Promise<{ taskId: string }> {
  const res = await authFetch(`${API_BASE}/projects/book-reveal/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coverPath }),
  });
  if (!res.ok) throw new Error('启动渲染失败');
  return res.json();
}

export async function fetchBookRevealProgress(taskId: string): Promise<{
  stage: string; percent: number; message: string; outputPath?: string;
}> {
  const res = await authFetch(`${API_BASE}/projects/book-reveal/progress/${taskId}`);
  if (!res.ok) throw new Error('获取进度失败');
  return res.json();
}

// ========== 书籍卡片 API ==========
export async function renderBookCard(
  coverPath: string, bookName: string, subtitle?: string, backgroundPath?: string
): Promise<{ outputPath: string; verticalOutputPath: string }> {
  const res = await authFetch(`${API_BASE}/projects/book-card/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coverPath, bookName, subtitle, backgroundPath }),
  });
  if (!res.ok) throw new Error('书籍卡片渲染失败');
  return res.json();
}

// ========== 资产空间 API ==========
export interface SpaceAsset {
  id: number; name: string; file_path: string; type: 'image' | 'video' | 'audio';
  category: string; size: number; source: string; created_at: string;
}

export async function fetchAssets(params?: Record<string, string>): Promise<SpaceAsset[]> {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await authFetch(`${API_BASE}/assets${query}`);
  if (!res.ok) throw new Error('获取资产列表失败');
  const data = await res.json();
  return data.assets || [];
}

export async function uploadAsset(file: File, category?: string): Promise<SpaceAsset> {
  const formData = new FormData();
  formData.append('file', file);
  if (category) formData.append('category', category);
  const authHeader = getAuthHeader();
  const headers: HeadersInit = {};
  if (authHeader) headers['Authorization'] = authHeader;
  const res = await fetch(`${API_BASE}/assets/upload`, { method: 'POST', headers, body: formData });
  if (!res.ok) throw new Error('上传资产失败');
  return res.json();
}

export async function renameAsset(id: number, name: string): Promise<SpaceAsset> {
  const res = await authFetch(`${API_BASE}/assets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (res.status === 409) throw new Error('资产名称已存在');
  if (!res.ok) throw new Error('重命名失败');
  return res.json();
}

export async function deleteAsset(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/assets/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('删除资产失败');
}

export async function fetchAssetCategories(): Promise<string[]> {
  const res = await authFetch(`${API_BASE}/assets/categories`);
  if (!res.ok) throw new Error('获取分类失败');
  const data = await res.json();
  return data.categories || [];
}
