import { useState, useEffect } from 'react';
import {
  ImageStyle,
  fetchImageStyles,
  createImageStyle,
  updateImageStyle,
  deleteImageStyle,
} from '../api/client';
import { Modal } from '../components/ui/Modal';
import { IconPlus, IconSpinner, IconTrash, IconEdit } from '../components/ui/Icons';

interface StyleFormData {
  name: string;
  prompt: string;
  negative_prompt: string;
  is_default: boolean;
}

const defaultFormData: StyleFormData = {
  name: '',
  prompt: '',
  negative_prompt: '',
  is_default: false,
};

export function ImageStylesPage() {
  const [styles, setStyles] = useState<ImageStyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingStyle, setEditingStyle] = useState<ImageStyle | null>(null);
  const [formData, setFormData] = useState<StyleFormData>(defaultFormData);
  const [saving, setSaving] = useState(false);

  const loadStyles = async () => {
    try {
      setLoading(true);
      const data = await fetchImageStyles();
      setStyles(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStyles();
  }, []);

  const openCreateModal = () => {
    setEditingStyle(null);
    setFormData(defaultFormData);
    setShowModal(true);
  };

  const openEditModal = (style: ImageStyle) => {
    setEditingStyle(style);
    setFormData({
      name: style.name,
      prompt: style.prompt,
      negative_prompt: style.negative_prompt || '',
      is_default: style.is_default === 1,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.prompt.trim()) {
      alert('名称和提示词不能为空');
      return;
    }

    try {
      setSaving(true);
      if (editingStyle) {
        await updateImageStyle(editingStyle.id, formData);
      } else {
        await createImageStyle(formData);
      }
      setShowModal(false);
      loadStyles();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`确定要删除「${name}」吗？`)) return;
    try {
      await deleteImageStyle(id);
      setStyles(styles.filter((s) => s.id !== id));
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
        <button onClick={loadStyles} className="btn btn-secondary">
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
          <h2 className="text-xl font-semibold text-white">画面风格管理</h2>
          <p className="text-sm text-slate-400 mt-1">{styles.length} 个风格</p>
        </div>
        <button onClick={openCreateModal} className="btn btn-primary flex items-center gap-2">
          <IconPlus className="w-4 h-4" />
          新建风格
        </button>
      </div>

      {/* 风格列表 */}
      {styles.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
            <IconPlus className="w-8 h-8 text-slate-500" />
          </div>
          <p className="text-slate-400 mb-4">还没有画面风格，创建一个吧</p>
          <button onClick={openCreateModal} className="btn btn-primary">
            创建第一个风格
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {styles.map((style) => (
            <StyleCard
              key={style.id}
              style={style}
              onEdit={() => openEditModal(style)}
              onDelete={() => handleDelete(style.id, style.name)}
            />
          ))}
        </div>
      )}

      {/* 编辑弹窗 */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingStyle ? '编辑画面风格' : '新建画面风格'}
        size="md"
      >
        <StyleForm
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmit}
          onCancel={() => setShowModal(false)}
          saving={saving}
          isEdit={!!editingStyle}
        />
      </Modal>
    </div>
  );
}

// 风格卡片组件
function StyleCard({
  style,
  onEdit,
  onDelete,
}: {
  style: ImageStyle;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card p-4 group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-medium text-white">{style.name}</h3>
            {style.is_default === 1 && (
              <span className="px-2 py-0.5 text-xs bg-indigo-500/20 text-indigo-400 rounded">
                默认
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 line-clamp-2 mb-2">{style.prompt}</p>
          {style.negative_prompt && (
            <p className="text-xs text-slate-500 line-clamp-1">
              负面提示词: {style.negative_prompt}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-2 text-slate-400 hover:text-indigo-400 transition-colors"
          >
            <IconEdit className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-red-400 transition-colors"
          >
            <IconTrash className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// 表单组件
function StyleForm({
  formData,
  setFormData,
  onSubmit,
  onCancel,
  saving,
  isEdit,
}: {
  formData: StyleFormData;
  setFormData: (data: StyleFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  saving: boolean;
  isEdit: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">风格名称</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="input w-full"
          placeholder="例如：简笔画风格"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">画面提示词</label>
        <textarea
          value={formData.prompt}
          onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
          className="input w-full h-32 resize-none"
          placeholder="描述画面风格的提示词..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">负面提示词</label>
        <textarea
          value={formData.negative_prompt}
          onChange={(e) => setFormData({ ...formData, negative_prompt: e.target.value })}
          className="input w-full h-20 resize-none"
          placeholder="不希望出现的元素..."
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_default"
          checked={formData.is_default}
          onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-indigo-500"
        />
        <label htmlFor="is_default" className="text-sm text-slate-300">
          设为默认风格
        </label>
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          取消
        </button>
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? '保存中...' : isEdit ? '保存' : '创建'}
        </button>
      </div>
    </form>
  );
}
