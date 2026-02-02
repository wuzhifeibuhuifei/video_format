import { useState, useEffect } from 'react';
import { CreateProjectRequest, fetchConfig, fetchImageStyles, ImageStyle } from '../../api/client';
import { IconSpinner } from './Icons';

interface CreateProjectFormProps {
  onSubmit: (data: CreateProjectRequest) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function CreateProjectForm({ onSubmit, onCancel, loading }: CreateProjectFormProps) {
  const [formData, setFormData] = useState<CreateProjectRequest>({
    theme: '',
    style: '温暖治愈',
    aspect_ratio: '9:16',
    scene_count: 6,
    skip_insight: false,
    audio_effects: { enable_bgm: true },
  });
  const [useCustomText, setUseCustomText] = useState(false);
  const [imageStyles, setImageStyles] = useState<ImageStyle[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<number | 'custom'>('custom');

  // 加载默认配置和画面风格
  useEffect(() => {
    // 加载配置
    fetchConfig().then((config) => {
      setFormData((prev) => ({
        ...prev,
        image_style: config.default_image_style || '',
        style: config.default_story_tone || '温暖治愈',
        scene_count: config.default_scene_count || 6,
        audio_effects: { enable_bgm: config.enable_bgm !== false },
      }));
    }).catch(() => {
      const fallbackStyle = '简笔画风格，白色线条手绘，纯色克莱因蓝背景(#002FA7)，极简主义，干净利落的线条，儿童绘本插画感';
      setFormData((prev) => ({ ...prev, image_style: fallbackStyle }));
    });

    // 加载画面风格列表
    fetchImageStyles().then((styles) => {
      setImageStyles(styles);
      // 如果有默认风格，自动选中
      const defaultStyle = styles.find(s => s.is_default === 1);
      if (defaultStyle) {
        setSelectedStyleId(defaultStyle.id);
        setFormData((prev) => ({
          ...prev,
          image_style: defaultStyle.prompt,
          negative_prompt: defaultStyle.negative_prompt,
        }));
      }
    }).catch(() => {
      // 忽略错误，使用自定义模式
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  const handleStyleSelect = (styleId: number | 'custom') => {
    setSelectedStyleId(styleId);
    if (styleId === 'custom') {
      // 切换到自定义模式，清空或保留当前值
      return;
    }
    const style = imageStyles.find(s => s.id === styleId);
    if (style) {
      setFormData(prev => ({
        ...prev,
        image_style: style.prompt,
        negative_prompt: style.negative_prompt,
      }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 创作模式切换 */}
      <div className="flex gap-2 p-1 bg-slate-700/50 rounded-lg">
        <button
          type="button"
          onClick={() => setUseCustomText(false)}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            !useCustomText ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          AI 生成
        </button>
        <button
          type="button"
          onClick={() => setUseCustomText(true)}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            useCustomText ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          自定义文案
        </button>
      </div>

      {!useCustomText ? (
        <>
          {/* 主题输入 */}
          <div>
            <label className="input-label">视频主题 *</label>
            <input
              type="text"
              className="input"
              placeholder="例如：城市微光、深夜食堂、独居生活"
              value={formData.theme || ''}
              onChange={(e) => setFormData({ ...formData, theme: e.target.value })}
              required={!useCustomText}
            />
          </div>

          {/* 风格选择 */}
          <div>
            <label className="input-label">叙事风格</label>
            <select
              className="input"
              value={formData.style || '温暖治愈'}
              onChange={(e) => setFormData({ ...formData, style: e.target.value })}
            >
              <option value="温暖治愈">温暖治愈</option>
              <option value="理性思考">理性思考</option>
              <option value="幽默诙谐">幽默诙谐</option>
              <option value="文艺清新">文艺清新</option>
              <option value="励志正能量">励志正能量</option>
            </select>
          </div>
        </>
      ) : (
        /* 自定义文案 */
        <div>
          <label className="input-label">自定义文案 *</label>
          <textarea
            className="input min-h-[120px] resize-y"
            placeholder="输入您的视频文案，AI 将根据文案自动分镜..."
            value={formData.insight_text || ''}
            onChange={(e) => setFormData({ ...formData, insight_text: e.target.value, theme: '自定义文案' })}
            required={useCustomText}
          />
        </div>
      )}

      {/* 全局画面风格 */}
      <div>
        <label className="input-label">全局画面风格</label>
        {imageStyles.length > 0 && (
          <select
            className="input mb-2"
            value={selectedStyleId}
            onChange={(e) => handleStyleSelect(e.target.value === 'custom' ? 'custom' : parseInt(e.target.value))}
          >
            <option value="custom">自定义风格</option>
            {imageStyles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}{style.is_default === 1 ? ' (默认)' : ''}
              </option>
            ))}
          </select>
        )}
        <textarea
          className="input min-h-[80px] resize-y"
          placeholder="描述画面风格，例如：简笔画风格，白色线条手绘，纯色克莱因蓝背景..."
          value={formData.image_style || ''}
          onChange={(e) => {
            setFormData({ ...formData, image_style: e.target.value });
            setSelectedStyleId('custom');
          }}
        />
        <p className="text-xs text-slate-500 mt-1">
          {selectedStyleId === 'custom' ? '自定义风格将应用于所有镜头' : '选择预设风格或自定义编辑'}
        </p>
      </div>

      {/* 画面比例 */}
      <div>
        <label className="input-label">画面比例</label>
        <div className="grid grid-cols-4 gap-2">
          {['9:16', '16:9', '1:1', '4:3'].map((ratio) => (
            <button
              key={ratio}
              type="button"
              onClick={() => setFormData({ ...formData, aspect_ratio: ratio })}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-all border ${
                formData.aspect_ratio === ratio
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:border-slate-500'
              }`}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      {/* 镜头数量 */}
      <div>
        <label className="input-label">镜头数量</label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="3"
            max="15"
            value={formData.scene_count || 6}
            onChange={(e) => setFormData({ ...formData, scene_count: parseInt(e.target.value) })}
            className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <span className="w-8 text-center font-medium">{formData.scene_count}</span>
        </div>
      </div>

      {/* 视频设置 (Subtitle & BGM) */}
      <div>
        <label className="input-label">视频设置</label>
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <input
              type="checkbox"
              id="subtitle-toggle"
              checked={formData.enable_subtitle !== false}
              onChange={(e) => setFormData({ ...formData, enable_subtitle: e.target.checked })}
              className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-700"
            />
            <label htmlFor="subtitle-toggle" className="text-sm text-slate-300 cursor-pointer select-none">
              显示字幕
            </label>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <input
              type="checkbox"
              id="bgm-toggle"
              checked={formData.audio_effects?.enable_bgm !== false}
              onChange={(e) => setFormData({
                ...formData,
                audio_effects: { ...formData.audio_effects, enable_bgm: e.target.checked }
              })}
              className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-700"
            />
            <label htmlFor="bgm-toggle" className="text-sm text-slate-300 cursor-pointer select-none">
              启用背景音乐
            </label>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn btn-secondary flex-1">
          取消
        </button>
        <button type="submit" disabled={loading} className="btn btn-primary flex-1">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <IconSpinner className="w-4 h-4" />
              生成中...
            </span>
          ) : (
            '创建项目'
          )}
        </button>
      </div>
    </form>
  );
}
