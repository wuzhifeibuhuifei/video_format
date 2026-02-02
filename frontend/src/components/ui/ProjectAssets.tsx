import { useState, useEffect } from 'react';
import { fetchProjectAssets, ProjectAssets as ProjectAssetsType, AssetInfo, getAuthHeader } from '../../api/client';

interface ProjectAssetsProps {
  projectId: number;
  refreshTrigger?: number;
}

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 资产类型图标
function AssetIcon({ type }: { type: 'image' | 'audio' | 'video' | 'character' | 'final' }) {
  const icons = {
    image: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    audio: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      </svg>
    ),
    video: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
    character: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    final: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
      </svg>
    ),
  };
  return icons[type];
}

export function ProjectAssets({ projectId, refreshTrigger }: ProjectAssetsProps) {
  const [assets, setAssets] = useState<ProjectAssetsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<AssetInfo | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'audio' | 'video' | null>(null);

  useEffect(() => {
    loadAssets();
  }, [projectId, refreshTrigger]);

  const loadAssets = async () => {
    try {
      setLoading(true);
      const data = await fetchProjectAssets(projectId);
      setAssets(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载资产失败');
    } finally {
      setLoading(false);
    }
  };

  const openPreview = (asset: AssetInfo, type: 'image' | 'audio' | 'video') => {
    setPreviewAsset(asset);
    setPreviewType(type);
  };

  const closePreview = () => {
    setPreviewAsset(null);
    setPreviewType(null);
  };

  if (loading) {
    return (
      <div className="bg-[#0f172a]/60 backdrop-blur-sm rounded-xl border border-white/10 p-4">
        <div className="animate-pulse flex items-center gap-4">
          <div className="h-4 bg-slate-700 rounded w-24"></div>
          <div className="h-4 bg-slate-700 rounded w-32"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!assets) return null;

  const { summary } = assets;

  return (
    <>
      <div className="bg-[#0f172a]/60 backdrop-blur-sm rounded-xl border border-white/10 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white">项目资产</h3>
          <span className="text-xs text-slate-400">
            共 {summary.total.count} 个文件 · {formatSize(summary.total.totalSize)}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <AssetCard
            icon={<AssetIcon type="image" />}
            label="分镜图片"
            count={summary.images.count}
            size={summary.images.totalSize}
            color="indigo"
            items={assets.assets.images}
            onPreview={(item) => openPreview(item, 'image')}
          />
          <AssetCard
            icon={<AssetIcon type="audio" />}
            label="语音音频"
            count={summary.audios.count}
            size={summary.audios.totalSize}
            color="emerald"
            items={assets.assets.audios}
            onPreview={(item) => openPreview(item, 'audio')}
          />
          <AssetCard
            icon={<AssetIcon type="video" />}
            label="分镜视频"
            count={summary.videos.count}
            size={summary.videos.totalSize}
            color="purple"
            items={assets.assets.videos}
            onPreview={(item) => openPreview(item, 'video')}
          />
          <AssetCard
            icon={<AssetIcon type="character" />}
            label="角色形象"
            count={summary.characterImage.count}
            size={summary.characterImage.totalSize}
            color="amber"
            items={assets.assets.characterImage ? [assets.assets.characterImage] : []}
            onPreview={(item) => openPreview(item, 'image')}
          />
          <AssetCard
            icon={<AssetIcon type="final" />}
            label="最终视频"
            count={summary.finalVideo.count}
            size={summary.finalVideo.totalSize}
            color="cyan"
            items={assets.assets.finalVideo ? [assets.assets.finalVideo] : []}
            onPreview={(item) => openPreview(item, 'video')}
          />
        </div>
      </div>

      {/* 预览弹窗 */}
      {previewAsset && previewType && (
        <AssetPreviewModal
          asset={previewAsset}
          type={previewType}
          onClose={closePreview}
        />
      )}
    </>
  );
}

// 资产卡片组件
interface AssetCardProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  size: number;
  color: 'indigo' | 'emerald' | 'purple' | 'amber' | 'cyan';
  items: AssetInfo[];
  onPreview: (item: AssetInfo) => void;
}

function AssetCard({ icon, label, count, size, color, items, onPreview }: AssetCardProps) {
  const [expanded, setExpanded] = useState(false);

  const colorClasses = {
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  };

  return (
    <div className={`rounded-lg border p-3 ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-lg font-bold text-white">{count}</div>
      <div className="text-xs text-slate-400">{formatSize(size)}</div>

      {items.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs hover:underline"
        >
          {expanded ? '收起' : '查看详情'}
        </button>
      )}

      {expanded && items.length > 0 && (
        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between text-xs bg-black/20 rounded px-2 py-1 cursor-pointer hover:bg-black/30"
              onClick={() => onPreview(item)}
            >
              <span className="truncate flex-1 mr-2">
                {item.shotIndex !== undefined ? `镜头 ${item.shotIndex}` : item.path.split('/').pop()}
              </span>
              <span className="text-slate-500 whitespace-nowrap">{formatSize(item.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 资产预览弹窗
interface AssetPreviewModalProps {
  asset: AssetInfo;
  type: 'image' | 'audio' | 'video';
  onClose: () => void;
}

function AssetPreviewModal({ asset, type, onClose }: AssetPreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMedia = async () => {
      try {
        setLoading(true);
        const assetPath = `/${asset.path.replace(/\\/g, '/')}`;
        const authHeader = getAuthHeader();

        const res = await fetch(assetPath, {
          headers: authHeader ? { Authorization: authHeader } : {},
        });

        if (!res.ok) {
          throw new Error('加载失败');
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    };

    loadMedia();

    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [asset.path]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[90vh] bg-[#0f172a] rounded-xl border border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h3 className="text-sm font-medium text-white">资产预览</h3>
            <p className="text-xs text-slate-400 mt-1 truncate max-w-md">{asset.path}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 min-h-[200px] flex items-center justify-center">
          {loading && (
            <div className="text-slate-400 text-sm">加载中...</div>
          )}

          {error && (
            <div className="text-red-400 text-sm">{error}</div>
          )}

          {!loading && !error && blobUrl && (
            <>
              {type === 'image' && (
                <img
                  src={blobUrl}
                  alt="预览"
                  className="max-w-full max-h-[70vh] object-contain mx-auto rounded-lg"
                />
              )}

              {type === 'audio' && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <AssetIcon type="audio" />
                  <audio controls className="w-full max-w-md">
                    <source src={blobUrl} type="audio/mpeg" />
                    您的浏览器不支持音频播放
                  </audio>
                </div>
              )}

              {type === 'video' && (
                <video
                  controls
                  autoPlay
                  className="max-w-full max-h-[70vh] mx-auto rounded-lg"
                >
                  <source src={blobUrl} type="video/mp4" />
                  您的浏览器不支持视频播放
                </video>
              )}
            </>
          )}
        </div>

        {/* 底部信息 */}
        <div className="px-4 pb-4">
          <div className="text-xs text-slate-400">
            文件大小: {formatSize(asset.size)}
          </div>
        </div>
      </div>
    </div>
  );
}
