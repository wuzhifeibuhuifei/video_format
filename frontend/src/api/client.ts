const API_BASE = '/api';

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
  const res = await fetch(`${API_BASE}/config`);
  if (!res.ok) throw new Error('获取配置失败');
  return res.json();
}

// API 函数
export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error('获取项目列表失败');
  const data = await res.json();
  return data.projects || [];
}

export async function fetchProject(id: number): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}`);
  if (!res.ok) throw new Error('获取项目详情失败');
  return res.json();
}

export async function createProject(data: CreateProjectRequest): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects`, {
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
  const res = await fetch(`${API_BASE}/projects/${projectId}/shots`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shots }),
  });
  if (!res.ok) throw new Error('更新镜头失败');
  return res.json();
}

export async function deleteProject(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除项目失败');
}

export async function generateImages(projectId: number, missingOnly = true): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/images?missing_only=${missingOnly}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('生成图片失败');
  return res.json();
}

export async function regenerateShotImage(projectId: number, shotId: number): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/shots/${shotId}/image`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('重新生成图片失败');
  return res.json();
}

export async function uploadShotImage(projectId: number, shotId: number, file: File): Promise<Project> {
  const formData = new FormData();
  formData.append('image', file);

  const res = await fetch(`${API_BASE}/projects/${projectId}/shots/${shotId}/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('上传图片失败');
  return res.json();
}

export async function confirmProject(id: number): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}/confirm`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('渲染失败');
  return res.json();
}

export async function fetchRemotionProps(id: number) {
  const res = await fetch(`${API_BASE}/projects/${id}/remotion-props`);
  if (!res.ok) throw new Error('获取预览数据失败');
  return res.json();
}

export async function exportProject(id: number) {
  const res = await fetch(`${API_BASE}/projects/${id}/export`);
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
  const res = await fetch(`${API_BASE}/projects/${projectId}/progress`);
  if (!res.ok) throw new Error('获取进度失败');
  return res.json();
}

// 视频生成相关 API
export async function generateVideoPrompt(
  projectId: number,
  shotId: number
): Promise<{ video_prompt: string }> {
  const res = await fetch(
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
  const res = await fetch(
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
  const res = await fetch(
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
