import { useState, useEffect, useCallback } from 'react';
import { CreateProjectRequest, fetchConfig, fetchImageStyles, generateRandomTheme, ImageStyle } from '../../api/client';
import { IconSpinner, IconSparkles } from './Icons';

// 10个引发共鸣、深入人心的视频主题
const THEME_OPTIONS = [
  {
    id: 'city_lonely',
    title: '城市独居时刻',
    description: '一个人吃饭，一个人散步，一个人看窗外的城市灯火',
    icon: '🏙️',
    tags: ['独居', '都市', '共鸣']
  },
  {
    id: 'midnight_convenience',
    title: '深夜便利店',
    description: '凌晨两点的便利店，收银员和夜归人的故事',
    icon: '🏪',
    tags: ['深夜', '温暖', '治愈']
  },
  {
    id: 'parents_back',
    title: '父母的背影',
    description: '那些我们不敢正视的瞬间，父母也在慢慢变老',
    icon: '👨‍👩‍👧',
    tags: ['亲情', '感恩', '催泪']
  },
  {
    id: 'graduation_year',
    title: '毕业那年',
    description: '青春不散场，我们笑着说再见，却各自红了眼眶',
    icon: '🎓',
    tags: ['青春', '告别', '回忆']
  },
  {
    id: 'drift_alone',
    title: '一个人的漂泊',
    description: '异地他乡的夜晚，既坚强又脆弱的自己',
    icon: '✈️',
    tags: ['北漂', '沪漂', '梦想']
  },
  {
    id: 'childhood_memory',
    title: '童年记忆碎片',
    description: '那些再也回不去的夏天，和早已走散的人',
    icon: '🪁',
    tags: ['童年', '怀旧', '温暖']
  },
  {
    id: 'long_distance_love',
    title: '异地恋的思念',
    description: '隔着屏幕的爱，无数次的说晚安和我想你',
    icon: '💌',
    tags: ['爱情', '等待', '坚持']
  },
  {
    id: 'adult_breakdown',
    title: '成年人的崩溃瞬间',
    description: '那些藏在卫生间里，和躲在角落里的无声哭泣',
    icon: '🌧️',
    tags: ['成长', '压力', '真实']
  },
  {
    id: 'city_warmth',
    title: '城市的温度',
    description: '陌生人之间的善意，让这座城市不再冰冷',
    icon: '☀️',
    tags: ['温暖', '善意', '美好']
  },
  {
    id: 'letter_to_future',
    title: '时光慢递',
    description: '写给三年后的自己，那些期待和遗憾',
    icon: '📮',
    tags: ['未来', '期许', '成长']
  }
] as const;

type ThemeId = typeof THEME_OPTIONS[number]['id'];

// 用于跟踪已使用的主题（在当前会话中）
let usedThemes: Set<ThemeId> = new Set();

function getRandomTheme(): typeof THEME_OPTIONS[number] | null {
  // 获取未使用的主题
  const availableThemes = THEME_OPTIONS.filter(t => !usedThemes.has(t.id));

  if (availableThemes.length === 0) {
    // 所有主题都已使用，重置计数器
    usedThemes.clear();
    return THEME_OPTIONS[Math.floor(Math.random() * THEME_OPTIONS.length)];
  }

  const selected = availableThemes[Math.floor(Math.random() * availableThemes.length)];
  usedThemes.add(selected.id);
  return selected;
}

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
  const [isGeneratingTheme, setIsGeneratingTheme] = useState(false);
  const [usedAiThemes, setUsedAiThemes] = useState<string[]>([]);

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

  // AI生成新主题
  const handleAiGenerateTheme = useCallback(async () => {
    setIsGeneratingTheme(true);
    try {
      const theme = await generateRandomTheme(usedAiThemes);
      setFormData(prev => ({ ...prev, theme: theme.title }));
      setUsedAiThemes(prev => [...prev.slice(-9), theme.title]); // 保留最近10个
    } catch (error) {
      console.error('生成主题失败:', error);
    } finally {
      setIsGeneratingTheme(false);
    }
  }, [usedAiThemes]);

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
          {/* 主题选择 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="input-label mb-0">选择主题 *</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const theme = getRandomTheme();
                    if (theme) {
                      setFormData({ ...formData, theme: theme.title });
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-rose-500 to-orange-500 rounded-lg text-white text-xs font-medium hover:from-rose-600 hover:to-orange-600 transition-all shadow-lg shadow-orange-500/20"
                  title="从预设主题中随机选择"
                >
                  <IconSparkles className="w-3.5 h-3.5" />
                  预设推荐
                </button>
                <button
                  type="button"
                  onClick={handleAiGenerateTheme}
                  disabled={isGeneratingTheme}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-500 to-purple-500 rounded-lg text-white text-xs font-medium hover:from-violet-600 hover:to-purple-600 transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50"
                  title="AI生成全新的独特主题"
                >
                  {isGeneratingTheme ? (
                    <IconSpinner className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <IconSparkles className="w-3.5 h-3.5" />
                  )}
                  AI生成
                </button>
              </div>
            </div>

            {/* 主题推荐卡片 */}
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
              {THEME_OPTIONS.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, theme: theme.title })}
                  className={`relative p-3 rounded-xl text-left transition-all duration-200 border ${
                    formData.theme === theme.title
                      ? 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border-indigo-500 shadow-lg shadow-indigo-500/10'
                      : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{theme.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200 truncate">
                        {theme.title}
                      </div>
                      <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                        {theme.description}
                      </div>
                    </div>
                    {formData.theme === theme.title && (
                      <div className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full shadow-sm" />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {theme.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 text-[10px] rounded-md bg-slate-700/50 text-slate-400"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            {/* 自定义主题输入 */}
            <div className="mt-3">
              <input
                type="text"
                className="input"
                placeholder="或者输入自定义主题..."
                value={formData.theme || ''}
                onChange={(e) => setFormData({ ...formData, theme: e.target.value })}
                required={!useCustomText}
              />
            </div>
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
        <label className="input-label">最大镜头数</label>
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
        <p className="text-xs text-slate-500 mt-1">AI 将根据内容自动生成合适的镜头数量（不超过此上限）</p>
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
