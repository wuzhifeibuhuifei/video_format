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
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
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
  shots?: Shot[];
  config?: ProjectConfig;
  preview_text?: string;
  character_image?: string;
}

export interface Shot {
  id: number;
  display_index: number;
  script_text: string;
  image_prompt: string;
  negative_prompt: string;
  image_path: string;
  voice_id?: string;
  video_prompt?: string;
  video_path?: string;
  video_status?: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface ProjectConfig {
  image_style?: string;
  negative_prompt?: string;
  voice_setting?: VoiceSetting;
  video_effects?: VideoEffects;
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

export async function confirmProject(id: number): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects/${id}/confirm`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('渲染失败');
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

// 资产相关类型
export interface AssetInfo {
  path: string;
  size: number;
  exists: boolean;
  shotIndex?: number;
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
  };
  summary: {
    images: AssetSummary;
    audios: AssetSummary;
    videos: AssetSummary;
    characterImage: AssetSummary;
    finalVideo: AssetSummary;
    total: AssetSummary;
  };
}

export async function fetchProjectAssets(projectId: number): Promise<ProjectAssets> {
  const res = await authFetch(`${API_BASE}/projects/${projectId}/assets`);
  if (!res.ok) throw new Error('获取项目资产失败');
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
