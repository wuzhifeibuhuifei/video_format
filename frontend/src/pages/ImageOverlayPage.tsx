import { useState } from 'react';
import { authFetch } from '../api/client';

const defaults = {
  videoSrc: 'assets/backgrounds/翻书.mp4',
  imageSrc: 'assets/backgrounds/封面图.png',
  fps: 24,
  width: 1920,
  height: 1080,
  durationInFrames: 240,
  initialScale: 0.5,
  finalScale: 1.2,
  initialX: 80,
  initialY: 30,
  targetX: 50,
  targetY: 50,
  moveStartFrame: 24,
  moveDurationFrames: 4,
  scaleDurationFrames: 212,
  imageWidth: 400,
  imageHeight: 300,
  outputFileName: 'overlay_test.mp4',
};

type FormData = typeof defaults;

const fields: { key: keyof FormData; label: string; type: 'text' | 'number' }[] = [
  { key: 'videoSrc', label: '背景视频路径', type: 'text' },
  { key: 'imageSrc', label: '叠加图片路径', type: 'text' },
  { key: 'fps', label: '帧率 (FPS)', type: 'number' },
  { key: 'width', label: '视频宽度', type: 'number' },
  { key: 'height', label: '视频高度', type: 'number' },
  { key: 'durationInFrames', label: '总时长（帧）', type: 'number' },
  { key: 'initialScale', label: '初始缩放比例', type: 'number' },
  { key: 'finalScale', label: '最终缩放比例', type: 'number' },
  { key: 'initialX', label: '初始 X 位置（%）', type: 'number' },
  { key: 'initialY', label: '初始 Y 位置（%）', type: 'number' },
  { key: 'targetX', label: '目标 X 位置（%）', type: 'number' },
  { key: 'targetY', label: '目标 Y 位置（%）', type: 'number' },
  { key: 'moveStartFrame', label: '开始移动帧', type: 'number' },
  { key: 'moveDurationFrames', label: '移动动画帧数', type: 'number' },
  { key: 'scaleDurationFrames', label: '放大动画帧数', type: 'number' },
  { key: 'imageWidth', label: '图片显示宽度 (px)', type: 'number' },
  { key: 'imageHeight', label: '图片显示高度 (px)', type: 'number' },
  { key: 'outputFileName', label: '输出文件名', type: 'text' },
];

export function ImageOverlayPage() {
  const [form, setForm] = useState<FormData>({ ...defaults });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (key: keyof FormData, value: string) => {
    const field = fields.find((f) => f.key === key)!;
    setForm((prev) => ({
      ...prev,
      [key]: field.type === 'number' ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await authFetch('/api/projects/image-overlay/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '渲染失败');
      setResult(data.outputPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-white mb-6">图片叠加视频工具</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {fields.map(({ key, label, type }) => (
            <div key={key} className={type === 'text' ? 'col-span-2' : ''}>
              <label className="input-label">{label}</label>
              <input
                type={type}
                step={type === 'number' ? 'any' : undefined}
                className="input w-full"
                value={form[key]}
                onChange={(e) => update(key, e.target.value)}
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
        {result && (
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <p className="text-sm text-green-400">渲染完成：{result}</p>
          </div>
        )}

        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? '渲染中...' : '开始渲染'}
        </button>
      </form>
    </div>
  );
}
