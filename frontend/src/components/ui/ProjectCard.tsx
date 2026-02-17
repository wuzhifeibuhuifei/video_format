import { Project } from '../../api/client';
import { IconVideo, IconTrash } from './Icons';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onDelete?: () => void;
}

export function ProjectCard({ project, onClick, onDelete }: ProjectCardProps) {
  const statusMap: Record<string, { label: string; class: string }> = {
    draft: { label: '草稿', class: 'status-draft' },
    rendered: { label: '已完成', class: 'status-rendered' },
    failed: { label: '失败', class: 'status-failed' },
    processing: { label: '处理中', class: 'status-processing' },
  };

  const status = statusMap[project.status] || statusMap.draft;

  // 显示标题：自定义文案项目显示预览文本，否则显示主题
  const displayTitle = project.theme === '自定义文案' && project.preview_text
    ? project.preview_text.slice(0, 30) + (project.preview_text.length > 30 ? '...' : '')
    : project.theme;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && confirm(`确定要删除项目「${project.theme}」吗？`)) {
      onDelete();
    }
  };

  return (
    <div
      onClick={onClick}
      className="card card-hover p-4 group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-white truncate">{displayTitle}</h3>
            <span className={`status-badge ${status.class}`}>{status.label}</span>
          </div>
          <p className="text-sm text-slate-400 truncate">
            {project.style} · {project.aspect_ratio} · {project.scene_count} 镜头
          </p>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {project.video_path && (
            <button className="p-2 text-slate-400 hover:text-emerald-400 transition-colors">
              <IconVideo className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={handleDelete}
              className="p-2 text-slate-400 hover:text-red-400 transition-colors"
            >
              <IconTrash className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
