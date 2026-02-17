import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Project,
  Shot,
  TaskProgress,
  fetchProject,
  updateShots,
  updateProjectConfig,
  confirmProject,
  generateImages,
  regenerateShotImage,
  uploadShotImage,
  fetchProgress,
  uploadCharacterImage,
  deleteCharacterImage,
  uploadBackground,
  deleteBackground,
  uploadShotBackground,
  deleteShotBackground,
  uploadShotHighlightSfx,
  deleteShotHighlightSfx,
  addShot,
  deleteShot,
  duplicateShot,
  generateAndBurnSubtitles,
} from '../api/client';
import { ShotEditor } from '../components/ui/ShotEditor';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ProjectAssets } from '../components/ui/ProjectAssets';
import { IconBack, IconPlay, IconImage, IconSpinner, IconPlus, IconTrash } from '../components/ui/Icons';

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [renderComplete, setRenderComplete] = useState(false);
  const [burningSubtitles, setBurningSubtitles] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [regeneratingShot, setRegeneratingShot] = useState<number | null>(null);
  const [progress, setProgress] = useState<TaskProgress | null>(null);
  const pollingRef = useRef<number | null>(null);
  // 用于强制刷新图片的计数器
  const [imageRefreshCounter, setImageRefreshCounter] = useState<Record<number, number>>({});
  // 上传状态
  const [uploadingShot, setUploadingShot] = useState<number | null>(null);
  // 角色形象上传状态
  const [uploadingCharacter, setUploadingCharacter] = useState(false);
  const characterInputRef = useRef<HTMLInputElement>(null);
  // 背景上传状态（读书解析）
  const [uploadingBg, setUploadingBg] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);
  // 段落独立背景上传状态
  const [uploadingShotBg, setUploadingShotBg] = useState<number | null>(null);
  // 段落自定义重点标注音效上传状态
  const [uploadingShotSfx, setUploadingShotSfx] = useState<number | null>(null);
  // 配置编辑状态
  const [editingConfig, setEditingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configForm, setConfigForm] = useState({
    aspect_ratio: '9:16',
    enable_subtitle: true,
    subtitle_font_size: 40,
    subtitle_color: '#fbff00',
    enable_bgm: true,
  });

  const id = projectId ? parseInt(projectId, 10) : 0;

  useEffect(() => {
    loadProject();
  }, [projectId]);

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const startPolling = (onComplete?: () => void) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    let wasRunning = false;
    pollingRef.current = window.setInterval(async () => {
      try {
        const res = await fetchProgress(id);
        if (res.status === 'running' && res.progress) {
          wasRunning = true;
          setProgress(res.progress);
        } else {
          setProgress(null);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          // 如果之前在运行，现在停止了，说明渲染完成
          if (wasRunning && onComplete) {
            onComplete();
          }
        }
      } catch {
        // 忽略轮询错误
      }
    }, 500);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setProgress(null);
  };

  const loadProject = async () => {
    try {
      setLoading(true);
      const data = await fetchProject(id);
      setProject(data);
      // 初始化配置表单
      setConfigForm({
        aspect_ratio: data.aspect_ratio || '9:16',
        enable_subtitle: data.config?.enable_subtitle !== false,
        subtitle_font_size: data.config?.subtitle_font_size || 46,
        subtitle_color: data.config?.subtitle_color || '#FFFFFF',
        enable_bgm: data.config?.audio_effects?.enable_bgm !== false,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleShotUpdate = async (updatedShot: Shot) => {
    if (!project?.shots) return;
    const newShots = project.shots.map((s) => (s.id === updatedShot.id ? updatedShot : s));
    try {
      const updated = await updateShots(id, newShots);
      setProject(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleGenerateAllImages = async () => {
    try {
      setGeneratingImages(true);
      startPolling();
      const updated = await generateImages(id, true);
      setProject(updated);
      // 更新刷新计数器，强制图片重新加载
      const newCounters: Record<number, number> = {};
      updated.shots?.forEach((shot) => {
        newCounters[shot.id] = (imageRefreshCounter[shot.id] || 0) + 1;
      });
      setImageRefreshCounter(newCounters);
    } catch (err) {
      alert(err instanceof Error ? err.message : '生成图片失败');
    } finally {
      stopPolling();
      setGeneratingImages(false);
    }
  };

  const handleRegenerateShotImage = async (shotId: number) => {
    try {
      setRegeneratingShot(shotId);
      const updated = await regenerateShotImage(id, shotId);
      setProject(updated);
      // 更新刷新计数器，强制图片重新加载
      setImageRefreshCounter((prev) => ({
        ...prev,
        [shotId]: (prev[shotId] || 0) + 1,
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : '重新生成失败');
    } finally {
      setRegeneratingShot(null);
    }
  };

  const handleUploadImage = async (shotId: number, file: File) => {
    try {
      setUploadingShot(shotId);
      const updated = await uploadShotImage(id, shotId, file);
      setProject(updated);
      // 更新刷新计数器，强制图片重新加载
      setImageRefreshCounter((prev) => ({
        ...prev,
        [shotId]: (prev[shotId] || 0) + 1,
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploadingShot(null);
    }
  };

  // 段落独立背景上传
  const handleUploadShotBackground = async (shotId: number, file: File) => {
    try {
      setUploadingShotBg(shotId);
      const updated = await uploadShotBackground(id, shotId, file);
      setProject(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传段落背景失败');
    } finally {
      setUploadingShotBg(null);
    }
  };

  // 段落独立背景删除
  const handleDeleteShotBackground = async (shotId: number) => {
    try {
      setUploadingShotBg(shotId);
      const updated = await deleteShotBackground(id, shotId);
      setProject(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除段落背景失败');
    } finally {
      setUploadingShotBg(null);
    }
  };

  // 段落自定义重点标注音效上传
  const handleUploadShotHighlightSfx = async (shotId: number, file: File) => {
    try {
      setUploadingShotSfx(shotId);
      const updated = await uploadShotHighlightSfx(id, shotId, file);
      setProject(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传重点标注音效失败');
    } finally {
      setUploadingShotSfx(null);
    }
  };

  // 段落自定义重点标注音效删除
  const handleDeleteShotHighlightSfx = async (shotId: number) => {
    try {
      setUploadingShotSfx(shotId);
      const updated = await deleteShotHighlightSfx(id, shotId);
      setProject(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除重点标注音效失败');
    } finally {
      setUploadingShotSfx(null);
    }
  };

  // 角色形象上传
  const handleCharacterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingCharacter(true);
      const updated = await uploadCharacterImage(id, file);
      setProject(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传角色形象失败');
    } finally {
      setUploadingCharacter(false);
      if (characterInputRef.current) {
        characterInputRef.current.value = '';
      }
    }
  };

  // 删除角色形象
  const handleDeleteCharacter = async () => {
    if (!confirm('确定要删除角色形象吗？')) return;
    try {
      const updated = await deleteCharacterImage(id);
      setProject(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除角色形象失败');
    }
  };

  // 背景上传（读书解析）
  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingBg(true);
      const updated = await uploadBackground(id, file);
      setProject(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传背景失败');
    } finally {
      setUploadingBg(false);
      if (bgInputRef.current) {
        bgInputRef.current.value = '';
      }
    }
  };

  // 删除背景（读书解析）
  const handleDeleteBg = async () => {
    if (!confirm('确定要删除背景素材吗？')) return;
    try {
      const updated = await deleteBackground(id);
      setProject(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除背景失败');
    }
  };

  // 添加段落
  const handleAddShot = async (afterIndex?: number) => {
    try {
      const updated = await addShot(id, '', afterIndex);
      setProject(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : '添加段落失败');
    }
  };

  // 删除段落
  const handleDeleteShot = async (shotId: number) => {
    if (!confirm('确定要删除该段落吗？')) return;
    try {
      const updated = await deleteShot(id, shotId);
      setProject(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除段落失败');
    }
  };

  // 复制段落
  const handleDuplicateShot = async (shotId: number) => {
    try {
      const updated = await duplicateShot(id, shotId);
      setProject(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : '复制段落失败');
    }
  };

  // 保存配置
  const handleSaveConfig = async () => {
    try {
      setSavingConfig(true);
      const updated = await updateProjectConfig(id, {
        aspect_ratio: configForm.aspect_ratio,
        enable_subtitle: configForm.enable_subtitle,
        subtitle_font_size: configForm.subtitle_font_size,
        subtitle_color: configForm.subtitle_color,
        audio_effects: { enable_bgm: configForm.enable_bgm },
      });
      setProject(updated);
      setEditingConfig(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存配置失败');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRender = async () => {
    if (!confirm('确定要开始渲染视频吗？')) return;
    try {
      setRendering(true);
      setRenderComplete(false);
      startPolling(() => {
        // 渲染完成回调
        setRenderComplete(true);
        setRendering(false);
        loadProject(); // 刷新项目数据
      });
      await confirmProject(id);
    } catch (err) {
      stopPolling();
      setRendering(false);
      alert(err instanceof Error ? err.message : '渲染失败');
    }
  };

  const handleGenerateAndBurnSubtitles = async () => {
    if (!project?.video_path) {
      alert('请先渲染视频');
      return;
    }
    if (!confirm('将为所有段落生成字幕并烧录到视频中，确定继续吗？')) return;
    try {
      setBurningSubtitles(true);
      await generateAndBurnSubtitles(id);
      startPolling(() => {
        setBurningSubtitles(false);
        loadProject();
      });
    } catch (err) {
      stopPolling();
      setBurningSubtitles(false);
      alert(err instanceof Error ? err.message : '字幕生成与烧录失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <IconSpinner className="w-8 h-8 text-indigo-500" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400">项目不存在</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* 头部导航 */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/')} className="btn btn-ghost p-2">
          <IconBack className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-white">{project.theme}</h2>
          <p className="text-sm text-slate-400">
            {project.category === 'book_analysis' ? '读书解析' : project.style} · {project.aspect_ratio} · {project.shots?.length || 0} {project.category === 'book_analysis' ? '段落' : '镜头'}
          </p>
        </div>
        <button
          onClick={() => setEditingConfig(!editingConfig)}
          className="btn btn-ghost btn-sm text-slate-400 hover:text-white"
        >
          {editingConfig ? '取消' : '设置'}
        </button>
      </div>

      {/* 配置编辑面板 */}
      {editingConfig && (
        <div className="mb-6 p-4 bg-slate-800/50 border border-slate-700/50 rounded-xl">
          <h3 className="text-sm font-medium text-slate-300 mb-4">视频配置</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 视频比例 */}
            <div>
              <label className="block text-xs text-slate-400 mb-2">视频比例</label>
              <select
                value={configForm.aspect_ratio}
                onChange={(e) => setConfigForm({ ...configForm, aspect_ratio: e.target.value })}
                className="input py-2"
              >
                <option value="9:16">9:16 (竖屏)</option>
                <option value="16:9">16:9 (横屏)</option>
                <option value="1:1">1:1 (方形)</option>
                <option value="4:3">4:3 (标准)</option>
              </select>
            </div>

            {/* 字幕开关 */}
            <div>
              <label className="block text-xs text-slate-400 mb-2">字幕显示</label>
              <div className="flex items-center gap-3 h-[42px]">
                <button
                  type="button"
                  onClick={() => setConfigForm({ ...configForm, enable_subtitle: true })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    configForm.enable_subtitle
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  显示
                </button>
                <button
                  type="button"
                  onClick={() => setConfigForm({ ...configForm, enable_subtitle: false })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    !configForm.enable_subtitle
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  隐藏
                </button>
              </div>
            </div>

            {/* 字幕字体大小 - 仅在字幕开启时显示 */}
            {configForm.enable_subtitle && (
              <div>
                <label className="block text-xs text-slate-400 mb-2">
                  字幕大小 ({configForm.subtitle_font_size}px)
                </label>
                <input
                  type="range"
                  min={24}
                  max={120}
                  step={2}
                  value={configForm.subtitle_font_size}
                  onChange={(e) => setConfigForm({ ...configForm, subtitle_font_size: Number(e.target.value) })}
                  className="w-full h-[42px] accent-indigo-500"
                />
              </div>
            )}

            {/* 字幕颜色 - 仅在字幕开启时显示 */}
            {configForm.enable_subtitle && (
              <div>
                <label className="block text-xs text-slate-400 mb-2">字幕颜色</label>
                <div className="flex items-center gap-3 h-[42px]">
                  <input
                    type="color"
                    value={configForm.subtitle_color}
                    onChange={(e) => setConfigForm({ ...configForm, subtitle_color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer border border-slate-600 bg-transparent"
                  />
                  <span className="text-sm text-slate-300">{configForm.subtitle_color}</span>
                </div>
              </div>
            )}

            {/* 背景音乐开关 */}
            <div>
              <label className="block text-xs text-slate-400 mb-2">背景音乐</label>
              <div className="flex items-center gap-3 h-[42px]">
                <button
                  type="button"
                  onClick={() => setConfigForm({ ...configForm, enable_bgm: true })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    configForm.enable_bgm
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  开启
                </button>
                <button
                  type="button"
                  onClick={() => setConfigForm({ ...configForm, enable_bgm: false })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    !configForm.enable_bgm
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  关闭
                </button>
              </div>
            </div>
          </div>

          {/* 保存按钮 */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSaveConfig}
              disabled={savingConfig}
              className="btn btn-primary btn-sm"
            >
              {savingConfig ? '保存中...' : '保存配置'}
            </button>
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-3 mb-6">
        {project.category !== 'book_analysis' && (
          <button
            onClick={handleGenerateAllImages}
            disabled={generatingImages}
            className="btn btn-secondary flex items-center gap-2"
          >
            {generatingImages ? <IconSpinner className="w-4 h-4" /> : <IconImage className="w-4 h-4" />}
            {generatingImages ? '生成中...' : '生成图片'}
          </button>
        )}
        <button
          onClick={handleRender}
          disabled={rendering}
          className="btn btn-success flex items-center gap-2"
        >
          {rendering ? <IconSpinner className="w-4 h-4" /> : <IconPlay className="w-4 h-4" />}
          {rendering ? '渲染中...' : '开始渲染'}
        </button>
      </div>

      {/* 进度条 - 渲染和字幕处理时显示 */}
      {progress && ['render', 'subtitle', 'merge', 'burn'].includes(progress.stage) && progress.percent > 5 && (
        <div className="mb-6">
          <ProgressBar progress={progress} />
        </div>
      )}

      {/* 渲染完成提示 */}
      {renderComplete && !rendering && (
        <div className="mb-6 p-4 bg-green-900/30 border border-green-500/50 rounded-lg">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-400 font-medium">渲染完成</span>
          </div>
        </div>
      )}

      {/* 字幕烧录按钮 - 渲染完成后显示 */}
      {project?.video_path && !rendering && (
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={handleGenerateAndBurnSubtitles}
            disabled={burningSubtitles}
            className="btn btn-primary flex items-center gap-2"
          >
            {burningSubtitles ? (
              <IconSpinner className="w-4 h-4" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
            )}
            {burningSubtitles ? '处理中...' : '生成字幕并烧录'}
          </button>
          {project.video_with_subtitles_path && (
            <span className="text-sm text-slate-400">
              已生成带字幕视频
            </span>
          )}
        </div>
      )}

      {/* 项目资产统计 */}
      <div className="mb-6">
        <ProjectAssets projectId={id} refreshTrigger={imageRefreshCounter[0]} onProjectUpdate={loadProject} />
      </div>

      {/* 读书解析：背景素材 */}
      {project.category === 'book_analysis' && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">背景素材</h3>
          <div className="card p-4">
            <input
              ref={bgInputRef}
              type="file"
              accept="image/*,video/mp4,video/mov,video/webm"
              onChange={handleBgUpload}
              className="hidden"
            />
            {project.background_path ? (
              <div className="flex items-start gap-4">
                <div className="relative w-32 h-20 rounded-lg overflow-hidden bg-slate-800 flex-shrink-0">
                  {project.background_type === 'video' ? (
                    <video
                      src={`/${project.background_path}`}
                      className="w-full h-full object-cover"
                      muted
                    />
                  ) : (
                    <img
                      src={`/${project.background_path}`}
                      alt="背景"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-300 mb-1">
                    已上传{project.background_type === 'video' ? '视频' : '图片'}背景
                  </p>
                  <p className="text-xs text-slate-500 mb-2">
                    {project.background_path.split('/').pop()}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => bgInputRef.current?.click()}
                      disabled={uploadingBg}
                      className="btn btn-secondary btn-sm"
                    >
                      {uploadingBg ? '上传中...' : '更换背景'}
                    </button>
                    <button
                      onClick={handleDeleteBg}
                      className="btn btn-ghost btn-sm text-red-400 hover:text-red-300"
                    >
                      <IconTrash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div
                  onClick={() => bgInputRef.current?.click()}
                  className="w-32 h-20 rounded-lg border-2 border-dashed border-slate-600 flex items-center justify-center cursor-pointer hover:border-emerald-500 transition-colors"
                >
                  {uploadingBg ? (
                    <IconSpinner className="w-6 h-6 text-slate-400" />
                  ) : (
                    <IconPlus className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-slate-300">上传背景素材 *</p>
                  <p className="text-xs text-slate-500 mt-1">
                    支持图片（jpg/png/webp）或视频（mp4/mov/webm）
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 角色形象（仅情感模式） */}
      {project.category !== 'book_analysis' && (
      <div className="mb-6">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">角色形象</h3>
        <div className="card p-4">
          <input
            ref={characterInputRef}
            type="file"
            accept="image/*"
            onChange={handleCharacterUpload}
            className="hidden"
          />
          {project.character_image ? (
            <div className="flex items-start gap-4">
              <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-slate-800 flex-shrink-0">
                <img
                  src={`/${project.character_image}`}
                  alt="角色形象"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1">
                <p className="text-sm text-slate-300 mb-2">
                  已设置角色形象，生成图片时将使用此形象作为参考
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => characterInputRef.current?.click()}
                    disabled={uploadingCharacter}
                    className="btn btn-secondary btn-sm"
                  >
                    {uploadingCharacter ? '上传中...' : '更换形象'}
                  </button>
                  <button
                    onClick={handleDeleteCharacter}
                    className="btn btn-ghost btn-sm text-red-400 hover:text-red-300"
                  >
                    <IconTrash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div
                onClick={() => characterInputRef.current?.click()}
                className="w-24 h-24 rounded-lg border-2 border-dashed border-slate-600 flex items-center justify-center cursor-pointer hover:border-indigo-500 transition-colors"
              >
                {uploadingCharacter ? (
                  <IconSpinner className="w-6 h-6 text-slate-400" />
                ) : (
                  <IconPlus className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div>
                <p className="text-sm text-slate-300">添加角色形象（可选）</p>
                <p className="text-xs text-slate-500 mt-1">
                  上传角色形象后，生成的所有图片将保持角色一致性
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* 镜头/段落列表 */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">
          {project.category === 'book_analysis' ? '段落列表' : '镜头列表'}
        </h3>
        {project.shots?.map((shot) => (
          <ShotEditor
            key={`${shot.id}-${imageRefreshCounter[shot.id] || 0}`}
            shot={shot}
            onSave={handleShotUpdate}
            onRegenerateImage={project.category !== 'book_analysis' ? () => handleRegenerateShotImage(shot.id) : undefined}
            onUploadImage={project.category !== 'book_analysis' ? (file) => handleUploadImage(shot.id, file) : undefined}
            onCreateVideo={project.category !== 'book_analysis' ? () => navigate(`/project/${id}/video/${shot.id}`) : undefined}
            onDelete={() => handleDeleteShot(shot.id)}
            onDuplicate={() => handleDuplicateShot(shot.id)}
            onUploadBackground={project.category === 'book_analysis' ? (file) => handleUploadShotBackground(shot.id, file) : undefined}
            onDeleteBackground={project.category === 'book_analysis' ? () => handleDeleteShotBackground(shot.id) : undefined}
            onUploadHighlightSfx={(file) => handleUploadShotHighlightSfx(shot.id, file)}
            onDeleteHighlightSfx={() => handleDeleteShotHighlightSfx(shot.id)}
            imageLoading={regeneratingShot === shot.id}
            uploading={uploadingShot === shot.id}
            backgroundUploading={uploadingShotBg === shot.id}
            highlightSfxUploading={uploadingShotSfx === shot.id}
            isBookAnalysis={project.category === 'book_analysis'}
          />
        ))}
        {/* 添加段落按钮 */}
        <button
          onClick={() => handleAddShot(project.shots?.length)}
          className="w-full py-3 border-2 border-dashed border-slate-600 rounded-xl text-slate-400 hover:border-indigo-500 hover:text-indigo-400 transition-colors flex items-center justify-center gap-2"
        >
          <IconPlus className="w-4 h-4" />
          {project.category === 'book_analysis' ? '添加段落' : '添加镜头'}
        </button>
      </div>
    </div>
  );
}
