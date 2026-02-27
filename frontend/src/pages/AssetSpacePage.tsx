import { useState, useEffect, useRef } from 'react';
import { fetchAssets, uploadAsset, deleteAsset, renameAsset, fetchAssetCategories, SpaceAsset } from '../api/client';

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function AssetSpacePage() {
  const [assets, setAssets] = useState<SpaceAsset[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const isDev = import.meta.env.DEV;
  const backendUrl = isDev ? 'http://127.0.0.1:3001' : '';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { sort: sortBy, order: sortOrder };
      if (filterType) params.type = filterType;
      if (filterCategory) params.category = filterCategory;
      const [list, cats] = await Promise.all([fetchAssets(params), fetchAssetCategories()]);
      setAssets(list);
      setCategories(cats);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [filterType, filterCategory, sortBy, sortOrder]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadAsset(file);
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该资产？')) return;
    try {
      await deleteAsset(id);
      setAssets(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRename = async (id: number) => {
    const trimmed = editName.trim();
    if (!trimmed) { setEditingId(null); return; }
    const asset = assets.find(a => a.id === id);
    if (asset && asset.name === trimmed) { setEditingId(null); return; }
    try {
      const updated = await renameAsset(id, trimmed);
      setAssets(prev => prev.map(a => a.id === id ? updated : a));
      setEditingId(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">资产空间</h2>
          <p className="text-sm text-slate-400 mt-1">{assets.length} 个资产</p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={handleUpload} />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>上传资产</button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="flex gap-3 mb-4">
        <select className="input" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">全部类型</option>
          <option value="image">图片</option>
          <option value="video">视频</option>
          <option value="audio">音频</option>
        </select>
        <select className="input" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">全部分类</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input" value={`${sortBy}_${sortOrder}`} onChange={e => {
          const [s, o] = e.target.value.split('_');
          setSortBy(s); setSortOrder(o);
        }}>
          <option value="created_at_DESC">最新优先</option>
          <option value="created_at_ASC">最早优先</option>
          <option value="name_ASC">名称 A-Z</option>
          <option value="name_DESC">名称 Z-A</option>
          <option value="size_DESC">大小降序</option>
          <option value="size_ASC">大小升序</option>
        </select>
      </div>

      {error && (
        <div className="p-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : assets.length === 0 ? (
        <div className="text-center py-20 text-slate-400">暂无资产</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {assets.map(asset => (
            <div key={asset.id} className="card group relative overflow-hidden rounded-lg border border-white/5">
              <div className="aspect-video bg-slate-800 flex items-center justify-center overflow-hidden">
                {asset.type === 'video' ? (
                  <video src={`${backendUrl}/${asset.file_path}`} className="w-full h-full object-cover" muted preload="metadata" />
                ) : asset.type === 'audio' ? (
                  <div className="flex flex-col items-center justify-center gap-2">
                    <span className="text-3xl text-emerald-400">♪</span>
                    <span className="text-xs text-slate-400 truncate max-w-[80%]">{asset.name}</span>
                  </div>
                ) : (
                  <img src={`${backendUrl}/${asset.file_path}`} className="w-full h-full object-cover" alt={asset.name} />
                )}
              </div>
              <div className="p-3">
                {editingId === asset.id ? (
                  <input
                    className="input text-sm w-full py-0.5 px-1"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onBlur={() => handleRename(asset.id)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(asset.id); if (e.key === 'Escape') setEditingId(null); }}
                    autoFocus
                  />
                ) : (
                  <p className="text-sm text-white truncate cursor-pointer hover:text-indigo-300" title="点击重命名" onClick={() => { setEditingId(asset.id); setEditName(asset.name); }}>{asset.name}</p>
                )}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-slate-400">{formatSize(asset.size)}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${asset.type === 'video' ? 'bg-purple-500/20 text-purple-300' : asset.type === 'audio' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300'}`}>
                    {asset.type === 'video' ? '视频' : asset.type === 'audio' ? '音频' : '图片'}
                  </span>
                </div>
                {asset.source !== 'upload' && (
                  <span className="text-xs text-slate-500 mt-1 block">来源: {asset.source}</span>
                )}
              </div>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <a
                  href={`${backendUrl}/${asset.file_path}`}
                  download={asset.name}
                  className="p-1.5 bg-indigo-500/80 hover:bg-indigo-500 rounded-lg text-white text-xs"
                >
                  下载
                </a>
                <button
                  onClick={() => handleDelete(asset.id)}
                  className="p-1.5 bg-red-500/80 hover:bg-red-500 rounded-lg text-white text-xs"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
