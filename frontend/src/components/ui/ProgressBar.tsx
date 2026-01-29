import { TaskProgress } from '../../api/client';

interface ProgressBarProps {
  progress: TaskProgress;
}

const stageLabels: Record<string, string> = {
  images: '生成图片',
  tts: '合成语音',
  render: '渲染视频',
};

export function ProgressBar({ progress }: ProgressBarProps) {
  const stageLabel = stageLabels[progress.stage] || progress.stage;

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-300">{stageLabel}</span>
        <span className="text-slate-400">{progress.percent}%</span>
      </div>
      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 transition-all duration-300 ease-out"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <p className="text-xs text-slate-400 mt-1">{progress.message}</p>
    </div>
  );
}
