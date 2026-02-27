import { useState, useRef, useEffect } from 'react';
import {
  uploadBookCover,
  generateBookCover,
  renderBookReveal,
  fetchBookRevealProgress,
  fetchAssets,
  SpaceAsset,
} from '../api/client';

export function BookRevealPage() {
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; message: string } | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [imageAssets, setImageAssets] = useState<SpaceAsset[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const res = await uploadBookCover(file);
      setCoverPath(res.path);
      setOutputPath(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openAssetPicker = async () => {
    try {
      const list = await fetchAssets({ type: 'image' });
      setImageAssets(list);
      setShowAssetPicker(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const selectAsset = (asset: SpaceAsset) => {
    setCoverPath(asset.file_path);
    setOutputPath(null);
    setShowAssetPicker(false);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await generateBookCover(prompt);
      setCoverPath(res.path);
      setOutputPath(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRender = async () => {
    if (!coverPath) return;
    setRendering(true);
    setError(null);
    setOutputPath(null);
    try {
      const { taskId } = await renderBookReveal(coverPath);
      timerRef.current = window.setInterval(async () => {
        try {
          const p = await fetchBookRevealProgress(taskId);
          setProgress({ percent: p.percent, message: p.message });
          if (p.stage === 'done') {
            clearInterval(timerRef.current!);
            timerRef.current = null;
            setRendering(false);
            setOutputPath(p.outputPath || null);
          } else if (p.stage === 'error') {
            clearInterval(timerRef.current!);
            timerRef.current = null;
            setRendering(false);
            setError(p.message);
          }
        } catch {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setRendering(false);
          setError('获取进度失败');
        }
      }, 1000);
    } catch (err: any) {
      setRendering(false);
      setError(err.message);
    }
  };

  // 开发环境使用完整后端地址，生产环境使用相对路径
  const isDev = import.meta.env.DEV;
  const backendUrl = isDev ? 'http://127.0.0.1:3001' : '';
  const coverUrl = coverPath?.startsWith('http') ? coverPath : (coverPath ? `${backendUrl}/${coverPath}` : null);
  const videoUrl = outputPath?.startsWith('http') ? outputPath : (outputPath ? `${backendUrl}/${outputPath}` : null);

  return (
    <div className="animate-fade-in space-y-6">
      <h2 className="text-2xl font-bold text-white">书籍揭示视频</h2>

      {/* 封面上传/生成 */}
      <div className="card p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">封面图片</h3>

        <div className="flex gap-3">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <button
            className="btn btn-secondary"
            disabled={loading}
            onClick={() => fileRef.current?.click()}
          >
            {loading ? '上传中...' : '上传封面'}
          </button>
          <button
            className="btn btn-secondary"
            disabled={loading}
            onClick={openAssetPicker}
          >
            从资产空间选择
          </button>
        </div>

        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="input-label">AI 生成封面</label>
            <input
              className="input w-full"
              placeholder="描述书籍封面，如：一本红色封面的心理学书籍"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          <button
            className="btn btn-secondary whitespace-nowrap"
            disabled={loading || !prompt.trim()}
            onClick={handleGenerate}
          >
            {loading ? '生成中...' : 'AI 生成'}
          </button>
        </div>

        {coverPath && coverUrl && (
          <div className="mt-4">
            <p className="text-sm text-slate-400 mb-2">封面预览</p>
            <img src={coverUrl} alt="封面" className="max-h-64 rounded-lg border border-white/10" />
          </div>
        )}
      </div>

      {/* 渲染 */}
      <div className="card p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">渲染视频</h3>

        <button
          className="btn btn-primary w-full"
          disabled={!coverPath || rendering}
          onClick={handleRender}
        >
          {rendering ? '渲染中...' : '开始渲染'}
        </button>

        {rendering && progress && (
          <div className="space-y-2">
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="text-sm text-slate-400">{progress.message} ({progress.percent}%)</p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {outputPath && videoUrl && (
          <div className="space-y-3">
            <p className="text-sm text-green-400">渲染完成</p>
            <video src={videoUrl} controls className="w-full rounded-lg border border-white/10" />
            <a
              href={videoUrl}
              download
              className="btn btn-secondary inline-block text-center"
            >
              下载视频
            </a>
          </div>
        )}
      </div>

      {/* 资产空间选择弹窗 */}
      {showAssetPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowAssetPicker(false)}>
          <div className="bg-slate-800 rounded-xl border border-white/10 p-6 w-full max-w-2xl max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">从资产空间选择图片</h3>
              <button className="text-slate-400 hover:text-white" onClick={() => setShowAssetPicker(false)}>✕</button>
            </div>
            {imageAssets.length === 0 ? (
              <p className="text-slate-400 text-center py-8">资产空间中暂无图片</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {imageAssets.map(asset => (
                  <div
                    key={asset.id}
                    className="cursor-pointer rounded-lg border border-white/5 hover:border-indigo-500 overflow-hidden transition-colors"
                    onClick={() => selectAsset(asset)}
                  >
                    <div className="aspect-video bg-slate-900">
                      <img src={`${backendUrl}/${asset.file_path}`} className="w-full h-full object-cover" alt={asset.name} />
                    </div>
                    <p className="text-xs text-slate-300 p-2 truncate">{asset.name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
