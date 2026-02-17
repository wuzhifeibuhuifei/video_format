import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Shot } from '../../api/client';
import { IconEdit, IconCheck, IconX, IconRefresh, IconVideo, IconUpload, IconSpinner, IconTrash, IconCopy } from './Icons';

interface ShotEditorProps {
  shot: Shot;
  onSave: (shot: Shot) => void;
  onRegenerateImage?: () => void;
  onUploadImage?: (file: File) => void;
  onCreateVideo?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onUploadBackground?: (file: File) => void;
  onDeleteBackground?: () => void;
  onUploadHighlightSfx?: (file: File) => void;
  onDeleteHighlightSfx?: () => void;
  imageLoading?: boolean;
  uploading?: boolean;
  backgroundUploading?: boolean;
  highlightSfxUploading?: boolean;
  isBookAnalysis?: boolean;
}

export function ShotEditor({ shot, onSave, onRegenerateImage, onUploadImage, onCreateVideo, onDelete, onDuplicate, onUploadBackground, onDeleteBackground, onUploadHighlightSfx, onDeleteHighlightSfx, imageLoading, uploading, backgroundUploading, highlightSfxUploading, isBookAnalysis }: ShotEditorProps) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState(shot);
  const [showLightbox, setShowLightbox] = useState(false);
  // 检查是否有有效的图片路径
  const hasImagePath = shot.image_path && shot.image_path.trim() !== '';
  const [imageExists, setImageExists] = useState(hasImagePath);
  const [imageLoadAttempted, setImageLoadAttempted] = useState(false); // 跟踪是否已尝试加载图片
  const [imageVersion, setImageVersion] = useState(Date.now()); // 用于强制刷新图片
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const sfxFileInputRef = useRef<HTMLInputElement>(null);
  const [bgVersion, setBgVersion] = useState(Date.now());

  // 使用 useMemo 和 shot.image_path 作为依赖，添加缓存破坏参数
  const imageUrl = useMemo(() => {
    const basePath = `/${shot.image_path.replace(/\\/g, '/')}`;
    // 使用 image_path 的内容生成简单的哈希作为缓存参数
    // 这样当 image_path 变化时 URL 会改变，但不会每次渲染都变化
    if (shot.image_path && shot.image_path !== '') {
      const hash = shot.image_path.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      // 添加时间戳版本以确保图片更新时能刷新
      return `${basePath}?v=${hash}&t=${imageVersion}`;
    }
    return basePath;
  }, [shot.image_path, imageVersion]);

  // 当 shot 变化时重置图片存在状态
  useEffect(() => {
    const hasPath = shot.image_path && shot.image_path.trim() !== '';
    setImageExists(hasPath);
    setImageLoadAttempted(false);
  }, [shot.id, shot.image_path]);

  // 当 shot 的 highlight_sfx_path 在编辑期间被外部更新（上传/删除）时，同步到 editData
  useEffect(() => {
    setEditData(prev => ({ ...prev, highlight_sfx_path: shot.highlight_sfx_path }));
  }, [shot.highlight_sfx_path]);

  const handleSave = () => {
    onSave(editData);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditData(shot);
    setEditing(false);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadImage) {
      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        alert('请选择图片文件');
        return;
      }
      // 验证文件大小（限制为 10MB）
      if (file.size > 10 * 1024 * 1024) {
        alert('图片大小不能超过 10MB');
        return;
      }
      try {
        await onUploadImage(file);
        // 上传成功后更新图片版本，强制刷新
        setImageVersion(Date.now());
      } catch (err) {
        // 错误已经在父组件处理
        console.error('Upload failed:', err);
      }
    }
    // 重置 input 以允许再次选择同一文件
    e.target.value = '';
  };

  const handleBgFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadBackground) {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
      if (!validTypes.some(t => file.type.startsWith(t.split('/')[0]))) {
        alert('请选择图片或视频文件');
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        alert('文件大小不能超过 100MB');
        return;
      }
      try {
        await onUploadBackground(file);
        setBgVersion(Date.now());
      } catch (err) {
        console.error('Background upload failed:', err);
      }
    }
    e.target.value = '';
  };

  const handleSfxFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadHighlightSfx) {
      const validExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!validExts.includes(ext)) {
        alert('请选择音频文件（mp3/wav/ogg/m4a/aac）');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert('音效文件大小不能超过 10MB');
        return;
      }
      try {
        await onUploadHighlightSfx(file);
      } catch (err) {
        console.error('Highlight sfx upload failed:', err);
      }
    }
    e.target.value = '';
  };

  const hasShotBackground = shot.background_path && shot.background_path.trim() !== '';
  const shotBgUrl = useMemo(() => {
    if (!hasShotBackground) return '';
    const basePath = `/${shot.background_path!.replace(/\\/g, '/')}`;
    return `${basePath}?t=${bgVersion}`;
  }, [shot.background_path, bgVersion, hasShotBackground]);

  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex gap-4">
        {/* 图片预览 - 读书解析模式下隐藏 */}
        {!isBookAnalysis && (
        <div className="relative w-32 h-32 flex-shrink-0 rounded-lg overflow-hidden bg-slate-700">
          <img
            src={imageUrl}
            alt={`镜头 ${shot.display_index}`}
            className={`w-full h-full object-cover transition-opacity ${imageExists ? 'cursor-pointer hover:opacity-80' : ''}`}
            onClick={() => imageExists && setShowLightbox(true)}
            onError={(e) => {
              // 只有在真的有图片路径但加载失败时才显示占位符
              if (hasImagePath && !imageLoadAttempted) {
                setImageExists(false);
                setImageLoadAttempted(true);
                (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23334155" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%2394a3b8" font-size="12">无图片</text></svg>';
              }
            }}
            onLoad={() => {
              // 只有在第一次尝试加载且成功时才标记为可点击
              if (hasImagePath && !imageLoadAttempted) {
                setImageLoadAttempted(true);
                setImageExists(true);
              }
            }}
          />
          {/* 重新生成按钮 - 右下角 */}
          {onRegenerateImage && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRegenerateImage();
              }}
              disabled={imageLoading || uploading}
              className="absolute bottom-1 right-1 p-1.5 bg-black/60 rounded-md hover:bg-black/80 transition-colors disabled:opacity-50"
              title="重新生成图片"
            >
              <IconRefresh className={`w-4 h-4 ${imageLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {/* 上传按钮 - 左下角，悬停时显示 */}
          {onUploadImage && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleUploadClick();
              }}
              disabled={uploading || imageLoading}
              className="absolute bottom-1 left-1 p-1.5 bg-black/60 rounded-md hover:bg-black/80 transition-colors disabled:opacity-50 opacity-0 hover:opacity-100"
              title="上传图片"
            >
              {uploading ? (
                <IconSpinner className="w-4 h-4 text-white" />
              ) : (
                <IconUpload className="w-4 h-4 text-white" />
              )}
            </button>
          )}
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
        )}

        {/* 内容区 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-indigo-400">{isBookAnalysis ? '段落' : '镜头'} {shot.display_index}</span>
            {!editing ? (
              <div className="flex gap-1">
                <button onClick={() => setEditing(true)} className="p-1 text-slate-400 hover:text-white">
                  <IconEdit className="w-4 h-4" />
                </button>
                {onDuplicate && (
                  <button onClick={onDuplicate} className="p-1 text-slate-400 hover:text-blue-400" title="复制">
                    <IconCopy className="w-4 h-4" />
                  </button>
                )}
                {onDelete && (
                  <button onClick={onDelete} className="p-1 text-slate-400 hover:text-red-400">
                    <IconTrash className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex gap-1">
                <button onClick={handleSave} className="p-1 text-emerald-400 hover:text-emerald-300">
                  <IconCheck className="w-4 h-4" />
                </button>
                <button onClick={handleCancel} className="p-1 text-red-400 hover:text-red-300">
                  <IconX className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">{isBookAnalysis ? '段落文案' : '镜头文案'}</label>
                <textarea
                  value={editData.script_text}
                  onChange={(e) => setEditData({ ...editData, script_text: e.target.value })}
                  className="input text-sm min-h-[80px] resize-y"
                  placeholder={isBookAnalysis ? '输入段落文案...' : '输入镜头文案...'}
                />
              </div>
              {!isBookAnalysis && (
              <div>
                <label className="text-xs text-slate-400 block mb-1">图片提示词</label>
                <textarea
                  value={editData.image_prompt}
                  onChange={(e) => setEditData({ ...editData, image_prompt: e.target.value })}
                  className="input text-sm min-h-[60px] resize-y"
                  placeholder="输入图片生成提示词..."
                />
              </div>
              )}
              <div>
                <label className="text-xs text-slate-400 block mb-1">重点标注文字</label>
                <input
                  type="text"
                  value={editData.highlight_text || ''}
                  onChange={(e) => setEditData({ ...editData, highlight_text: e.target.value })}
                  className="input text-sm"
                  placeholder="输入需要着重强调的文字（可选）..."
                />
                <p className="text-xs text-slate-500 mt-1">该文字会在视频中居中放大显示，配有弹出动画和音效。多个标注用 | 分隔</p>
              </div>
              {/* 自定义重点标注音效 */}
              {editData.highlight_text && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">自定义音效</label>
                  <div className="flex items-center gap-2">
                    {shot.highlight_sfx_path ? (
                      <>
                        <span className="text-xs text-emerald-400 truncate max-w-[200px]">
                          {shot.highlight_sfx_path.split('/').pop()}
                        </span>
                        <button
                          onClick={() => sfxFileInputRef.current?.click()}
                          disabled={highlightSfxUploading}
                          className="btn btn-ghost text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          {highlightSfxUploading ? <IconSpinner className="w-3 h-3" /> : '更换'}
                        </button>
                        {onDeleteHighlightSfx && (
                          <button
                            onClick={onDeleteHighlightSfx}
                            disabled={highlightSfxUploading}
                            className="btn btn-ghost text-xs text-red-400 hover:text-red-300"
                          >
                            <IconTrash className="w-3 h-3" />
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-slate-500">使用系统默认音效</span>
                        <button
                          onClick={() => sfxFileInputRef.current?.click()}
                          disabled={highlightSfxUploading}
                          className="btn btn-ghost text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                        >
                          {highlightSfxUploading ? (
                            <IconSpinner className="w-3 h-3" />
                          ) : (
                            <IconUpload className="w-3 h-3" />
                          )}
                          上传自定义音效
                        </button>
                      </>
                    )}
                  </div>
                  <input
                    ref={sfxFileInputRef}
                    type="file"
                    accept=".mp3,.wav,.ogg,.m4a,.aac"
                    onChange={handleSfxFileChange}
                    className="hidden"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-300 line-clamp-3">{shot.script_text}</p>
              {!isBookAnalysis && shot.image_prompt && (
                <div className="pt-2 border-t border-slate-700/50">
                  <p className="text-xs text-slate-500 mb-1">图片提示词</p>
                  <p className="text-xs text-slate-400 whitespace-pre-wrap break-words">{shot.image_prompt}</p>
                </div>
              )}
              {shot.highlight_text && (
                <div className="pt-2 border-t border-slate-700/50">
                  <p className="text-xs text-slate-500 mb-1">重点标注</p>
                  <p className="text-xs text-amber-400 font-medium">{shot.highlight_text}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    音效: {shot.highlight_sfx_path
                      ? <span className="text-emerald-400">{shot.highlight_sfx_path.split('/').pop()}</span>
                      : '系统默认'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 创作视频按钮 - 读书解析模式下隐藏 */}
          {!isBookAnalysis && onCreateVideo && !editing && (
            <button
              onClick={onCreateVideo}
              className="mt-2 btn btn-ghost text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
            >
              <IconVideo className="w-3 h-3" />
              创作视频
              {shot.video_status === 'completed' && (
                <span className="ml-1 text-emerald-400">✓</span>
              )}
            </button>
          )}

          {/* 段落独立背景 - 仅读书解析模式 */}
          {isBookAnalysis && !editing && (
            <div className="mt-2 pt-2 border-t border-slate-700/50">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">段落背景</span>
                {hasShotBackground && (
                  <span className="text-xs text-emerald-400/70">
                    ({shot.background_type === 'video' ? '视频' : '图片'})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {hasShotBackground && (
                  <div className="relative w-16 h-16 rounded overflow-hidden bg-slate-700 flex-shrink-0">
                    {shot.background_type === 'video' ? (
                      <video
                        src={shotBgUrl}
                        className="w-full h-full object-cover"
                        muted
                      />
                    ) : (
                      <img
                        src={shotBgUrl}
                        alt="段落背景"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                )}
                <div className="flex gap-1">
                  <button
                    onClick={() => bgFileInputRef.current?.click()}
                    disabled={backgroundUploading}
                    className="btn btn-ghost text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                  >
                    {backgroundUploading ? (
                      <IconSpinner className="w-3 h-3" />
                    ) : (
                      <IconUpload className="w-3 h-3" />
                    )}
                    {hasShotBackground ? '更换' : '上传背景'}
                  </button>
                  {hasShotBackground && onDeleteBackground && (
                    <button
                      onClick={onDeleteBackground}
                      disabled={backgroundUploading}
                      className="btn btn-ghost text-xs text-red-400 hover:text-red-300"
                    >
                      <IconTrash className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={bgFileInputRef}
                type="file"
                accept="image/*,video/mp4,video/quicktime,video/webm"
                onChange={handleBgFileChange}
                className="hidden"
              />
            </div>
          )}
        </div>
      </div>

      {/* 大图预览 Lightbox - 使用 Portal 渲染到 body */}
      {showLightbox && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowLightbox(false)}
        >
          <img
            src={imageUrl}
            alt={`镜头 ${shot.display_index}`}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setShowLightbox(false)}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"
          >
            <IconX className="w-8 h-8" />
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
