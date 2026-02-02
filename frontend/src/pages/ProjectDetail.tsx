import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Project,
  Shot,
  TaskProgress,
  fetchProject,
  updateShots,
  confirmProject,
  generateImages,
  regenerateShotImage,
  uploadShotImage,
  fetchProgress,
  uploadCharacterImage,
  deleteCharacterImage,
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

  const startPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = window.setInterval(async () => {
      try {
        const res = await fetchProgress(id);
        if (res.status === 'running' && res.progress) {
          setProgress(res.progress);
        } else {
          setProgress(null);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
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

  const handleRender = async () => {
    if (!confirm('确定要开始渲染视频吗？')) return;
    try {
      setRendering(true);
      startPolling();
      const updated = await confirmProject(id);
      setProject(updated);
      alert('渲染完成！');
    } catch (err) {
      alert(err instanceof Error ? err.message : '渲染失败');
    } finally {
      stopPolling();
      setRendering(false);
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
            {project.style} · {project.aspect_ratio} · {project.scene_count} 镜头
          </p>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleGenerateAllImages}
          disabled={generatingImages}
          className="btn btn-secondary flex items-center gap-2"
        >
          {generatingImages ? <IconSpinner className="w-4 h-4" /> : <IconImage className="w-4 h-4" />}
          {generatingImages ? '生成中...' : '生成图片'}
        </button>
        <button
          onClick={handleRender}
          disabled={rendering}
          className="btn btn-success flex items-center gap-2"
        >
          {rendering ? <IconSpinner className="w-4 h-4" /> : <IconPlay className="w-4 h-4" />}
          {rendering ? '渲染中...' : '开始渲染'}
        </button>
      </div>

      {/* 进度条 */}
      {progress && (
        <div className="mb-6">
          <ProgressBar progress={progress} />
        </div>
      )}

      {/* 项目资产统计 */}
      <div className="mb-6">
        <ProjectAssets projectId={id} refreshTrigger={imageRefreshCounter[0]} />
      </div>

      {/* 角色形象 */}
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

      {/* 镜头列表 */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">镜头列表</h3>
        {project.shots?.map((shot) => (
          <ShotEditor
            key={`${shot.id}-${imageRefreshCounter[shot.id] || 0}`}
            shot={shot}
            onSave={handleShotUpdate}
            onRegenerateImage={() => handleRegenerateShotImage(shot.id)}
            onUploadImage={(file) => handleUploadImage(shot.id, file)}
            onCreateVideo={() => navigate(`/project/${id}/video/${shot.id}`)}
            imageLoading={regeneratingShot === shot.id}
            uploading={uploadingShot === shot.id}
          />
        ))}
      </div>
    </div>
  );
}
