import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Project,
  Shot,
  fetchProject,
  generateVideoPrompt,
  generateShotVideo,
  updateShotVideoPrompt,
} from '../api/client';
import { IconBack, IconSpinner, IconPlay, IconRefresh } from '../components/ui/Icons';

export function VideoCreator() {
  const { projectId, shotId } = useParams<{ projectId: string; shotId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [loading, setLoading] = useState(true);
  const [videoPrompt, setVideoPrompt] = useState('');
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);

  const pid = projectId ? parseInt(projectId, 10) : 0;
  const sid = shotId ? parseInt(shotId, 10) : 0;

  useEffect(() => {
    loadData();
  }, [projectId, shotId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await fetchProject(pid);
      setProject(data);
      const foundShot = data.shots?.find((s) => s.id === sid);
      if (foundShot) {
        setShot(foundShot);
        // 如果已有提示词则直接使用，否则自动生成
        if (foundShot.video_prompt) {
          setVideoPrompt(foundShot.video_prompt);
        } else {
          // 自动生成提示词
          setGeneratingPrompt(true);
          try {
            const result = await generateVideoPrompt(pid, sid);
            setVideoPrompt(result.video_prompt);
          } catch {
            // 自动生成失败时不阻塞页面
          } finally {
            setGeneratingPrompt(false);
          }
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePrompt = async () => {
    if (!shot) return;
    try {
      setGeneratingPrompt(true);
      const result = await generateVideoPrompt(pid, sid);
      setVideoPrompt(result.video_prompt);
    } catch (err) {
      alert(err instanceof Error ? err.message : '生成提示词失败');
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const handleSavePrompt = async () => {
    if (!shot) return;
    try {
      await updateShotVideoPrompt(pid, sid, videoPrompt);
      alert('提示词已保存');
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleGenerateVideo = async () => {
    if (!shot) return;
    if (!videoPrompt.trim()) {
      alert('请先生成或输入视频提示词');
      return;
    }
    try {
      setGeneratingVideo(true);
      const updated = await generateShotVideo(pid, sid, videoPrompt);
      setProject(updated);
      const updatedShot = updated.shots?.find((s) => s.id === sid);
      if (updatedShot) {
        setShot(updatedShot);
      }
      alert('视频生成完成！');
    } catch (err) {
      alert(err instanceof Error ? err.message : '生成视频失败');
    } finally {
      setGeneratingVideo(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <IconSpinner className="w-8 h-8 text-indigo-500" />
      </div>
    );
  }

  if (!project || !shot) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400">镜头不存在</p>
      </div>
    );
  }

  const imageUrl = `/${shot.image_path.replace(/\\/g, '/')}`;
  const videoUrl = shot.video_path ? `/${shot.video_path.replace(/\\/g, '/')}` : null;

  return (
    <div className="animate-fade-in">
      {/* 头部导航 */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(`/project/${pid}`)} className="btn btn-ghost p-2">
          <IconBack className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-white">
            创作视频 - 镜头 {shot.display_index}
          </h2>
          <p className="text-sm text-slate-400">{project.theme}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：图片和视频预览 */}
        <div className="space-y-4">
          {/* 原始图片 */}
          <div className="card p-4">
            <h3 className="text-sm font-medium text-slate-400 mb-3">原始图片</h3>
            <div className="aspect-video rounded-lg overflow-hidden bg-slate-700">
              <img
                src={imageUrl}
                alt={`镜头 ${shot.display_index}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23334155" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%2394a3b8" font-size="12">无图片</text></svg>';
                }}
              />
            </div>
          </div>

          {/* 生成的视频 */}
          <div className="card p-4">
            <h3 className="text-sm font-medium text-slate-400 mb-3">生成的视频</h3>
            <div className="aspect-video rounded-lg overflow-hidden bg-slate-700">
              {videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500">
                  暂无视频
                </div>
              )}
            </div>
            {shot.video_status && (
              <p className="mt-2 text-xs text-slate-500">
                状态: {shot.video_status === 'completed' ? '已完成' :
                       shot.video_status === 'generating' ? '生成中' :
                       shot.video_status === 'failed' ? '失败' : '待生成'}
              </p>
            )}
          </div>
        </div>

        {/* 右侧：文案和提示词 */}
        <div className="space-y-4">
          {/* 镜头文案 */}
          <div className="card p-4">
            <h3 className="text-sm font-medium text-slate-400 mb-3">镜头文案</h3>
            <p className="text-sm text-slate-300">{shot.script_text}</p>
          </div>

          {/* 视频提示词 */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-400">视频提示词</h3>
              <button
                onClick={handleGeneratePrompt}
                disabled={generatingPrompt}
                className="btn btn-ghost text-xs flex items-center gap-1"
              >
                {generatingPrompt ? (
                  <IconSpinner className="w-3 h-3" />
                ) : (
                  <IconRefresh className="w-3 h-3" />
                )}
                {generatingPrompt ? '生成中...' : 'AI 生成'}
              </button>
            </div>
            <textarea
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
              className="input text-sm min-h-[150px] resize-y"
              placeholder="输入或生成视频提示词..."
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSavePrompt}
                className="btn btn-secondary text-sm"
              >
                保存提示词
              </button>
              <button
                onClick={handleGenerateVideo}
                disabled={generatingVideo || !videoPrompt.trim()}
                className="btn btn-primary flex items-center gap-2 text-sm"
              >
                {generatingVideo ? (
                  <IconSpinner className="w-4 h-4" />
                ) : (
                  <IconPlay className="w-4 h-4" />
                )}
                {generatingVideo ? '生成中...' : '生成视频'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
