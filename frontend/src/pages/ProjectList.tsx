import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project, fetchProjects, createProject, deleteProject, CreateProjectRequest } from '../api/client';
import { ProjectCard } from '../components/ui/ProjectCard';
import { Modal } from '../components/ui/Modal';
import { CreateProjectForm } from '../components/ui/CreateProjectForm';
import { IconPlus, IconSpinner } from '../components/ui/Icons';

export function ProjectList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await fetchProjects();
      setProjects(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreate = async (data: CreateProjectRequest) => {
    try {
      setCreating(true);
      const newProject = await createProject(data);
      setShowCreateModal(false);
      navigate(`/project/${newProject.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteProject(id);
      setProjects(projects.filter((p) => p.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <IconSpinner className="w-8 h-8 text-indigo-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-4">{error}</p>
        <button onClick={loadProjects} className="btn btn-secondary">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">我的项目</h2>
          <p className="text-sm text-slate-400 mt-1">{projects.length} 个项目</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary flex items-center gap-2">
          <IconPlus className="w-4 h-4" />
          新建项目
        </button>
      </div>

      {/* 项目列表 */}
      {projects.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
            <IconPlus className="w-8 h-8 text-slate-500" />
          </div>
          <p className="text-slate-400 mb-4">还没有项目，创建一个吧</p>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
            创建第一个项目
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => navigate(`/project/${project.id}`)}
              onDelete={() => handleDelete(project.id)}
            />
          ))}
        </div>
      )}

      {/* 创建项目弹窗 */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="新建视频项目" size="md">
        <CreateProjectForm onSubmit={handleCreate} onCancel={() => setShowCreateModal(false)} loading={creating} />
      </Modal>
    </div>
  );
}
