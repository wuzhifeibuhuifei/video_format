import { useState, useRef } from 'react';
import {
  uploadBookCover,
  generateBookCover,
  renderBookCard,
  fetchAssets,
  SpaceAsset,
} from '../api/client';

export function BookCardPage() {
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [backgroundPath, setBackgroundPath] = useState<string | null>(null);
  const [bookName, setBookName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [verticalOutputPath, setVerticalOutputPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'cover' | 'background'>('cover');
  const [imageAssets, setImageAssets] = useState<SpaceAsset[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // 生产环境和开发环境均使用相对路径（开发环境由 Vite proxy 处理）
  const toUrl = (p: string | null) => !p ? null : p.startsWith('http') ? p : `/${p}`;
  const coverUrl = toUrl(coverPath);
  const bgUrl = toUrl(backgroundPath);
  const imageUrl = toUrl(outputPath);
  const verticalImageUrl = toUrl(verticalOutputPath);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const res = await uploadBookCover(file);
      setCoverPath(res.path);
      setOutputPath(null);
      setVerticalOutputPath(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openAssetPicker = async (target: 'cover' | 'background') => {
    try {
      const list = await fetchAssets({ type: 'image' });
      setImageAssets(list);
      setPickerTarget(target);
      setShowAssetPicker(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await generateBookCover(prompt);
      setCoverPath(res.path);
      setOutputPath(null);
      setVerticalOutputPath(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectAsset = (asset: SpaceAsset) => {
    if (pickerTarget === 'background') {
      setBackgroundPath(asset.file_path);
    } else {
      setCoverPath(asset.file_path);
    }
    setOutputPath(null);
    setVerticalOutputPath(null);
    setShowAssetPicker(false);
  };

  const handleRender = async () => {
    if (!coverPath || !bookName.trim()) return;
    setRendering(true);
    setError(null);
    setOutputPath(null);
    setVerticalOutputPath(null);
    try {
      const res = await renderBookCard(coverPath, bookName, subtitle, backgroundPath || undefined);
      setOutputPath(res.outputPath);
      setVerticalOutputPath(res.verticalOutputPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <h2 className="text-2xl font-bold text-white">书籍卡片</h2>

      {/* 封面选择 */}
      <div className="card p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">封面图片</h3>
        <div className="flex gap-3">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <button className="btn btn-secondary" disabled={loading} onClick={() => fileRef.current?.click()}>
            {loading ? '上传中...' : '上传封面'}
          </button>
          <button className="btn btn-secondary" disabled={loading} onClick={() => openAssetPicker('cover')}>
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

      {/* 背景图选择 */}
      <div className="card p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">背景图片（可选）</h3>
        <div className="flex gap-3">
          <button className="btn btn-secondary" onClick={() => openAssetPicker('background')}>
            从资产空间选择
          </button>
          {backgroundPath && (
            <button className="btn btn-secondary" onClick={() => { setBackgroundPath(null); setOutputPath(null); setVerticalOutputPath(null); }}>
              清除背景
            </button>
          )}
        </div>
        {backgroundPath && bgUrl && (
          <div className="mt-4">
            <p className="text-sm text-slate-400 mb-2">背景预览</p>
            <img src={bgUrl} alt="背景" className="max-h-40 rounded-lg border border-white/10" />
          </div>
        )}
      </div>

      {/* 书名与渲染 */}
      <div className="card p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">生成卡片</h3>
        <div className="space-y-3">
          <div>
            <label className="input-label">书名</label>
            <input className="input w-full" placeholder="如：反脆弱" value={bookName} onChange={e => setBookName(e.target.value)} />
          </div>
          <div>
            <label className="input-label">副标题（可选）</label>
            <input className="input w-full" placeholder="如：从不确定性中获益" value={subtitle} onChange={e => setSubtitle(e.target.value)} />
          </div>
        </div>
        <button
          className="btn btn-primary w-full"
          disabled={!coverPath || !bookName.trim() || rendering}
          onClick={handleRender}
        >
          {rendering ? '生成中...' : '生成书籍卡片'}
        </button>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {outputPath && imageUrl && (
          <div className="space-y-4">
            <p className="text-sm text-green-400">生成完成（已自动保存到资产空间）</p>
            <div>
              <p className="text-sm text-slate-400 mb-2">横版</p>
              <img src={imageUrl} alt="书籍卡片-横版" className="w-full rounded-lg border border-white/10" />
              <a href={imageUrl} download className="btn btn-secondary inline-block text-center mt-2">下载横版</a>
            </div>
            {verticalOutputPath && verticalImageUrl && (
              <div>
                <p className="text-sm text-slate-400 mb-2">竖版</p>
                <img src={verticalImageUrl} alt="书籍卡片-竖版" className="max-h-[600px] rounded-lg border border-white/10" />
                <a href={verticalImageUrl} download className="btn btn-secondary inline-block text-center mt-2">下载竖版</a>
              </div>
            )}
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
                      <img src={`/${asset.file_path}`} className="w-full h-full object-cover" alt={asset.name} />
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
