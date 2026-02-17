import { useEffect, useState } from 'react';
import {
  fetchSystemConfig,
  updateSystemConfig,
  resetSystemConfig,
  testApiConnection,
  SystemConfigPayload,
} from '../api/client';
import { IconSpinner, IconRefresh, IconCheck, IconEye, IconEyeOff, IconTest, IconReset } from '../components/ui/Icons';

const defaultConfig: SystemConfigPayload = {
  image: { model: '', apiKey: '', enable: true },
  video: { model: '', apiKey: '', enable: true },
  tts: { voiceId: '', apiKey: '', model: '', speed: 1.1, vol: 1.0 },
  videoEffects: {
    enableMovement: true,
    movementType: 'zoom_in',
    zoomRatio: 1.12,
    panXRange: 50,
    panYRange: 50,
    enableSubtitle: false,
  },
  audioEffects: {
    enableBgm: true,
    bgmVolume: 0.2,
    bgmLoop: true,
    bgmFadein: 2.0,
    bgmFadeout: 3.0,
  },
  timing: {
    baseDuration: 3.0,
    charsPerSecond: 0.25,
    minDuration: 2.0,
    maxDuration: 8.0,
    transitionDuration: 0.1,
  },
};

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

export function SettingsPage() {
  const [form, setForm] = useState<SystemConfigPayload>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showApiKeys, setShowApiKeys] = useState<{ [key: string]: boolean }>({});
  const [testStatus, setTestStatus] = useState<{ [key: string]: TestStatus }>({});
  const [testMessages, setTestMessages] = useState<{ [key: string]: string }>({});

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await fetchSystemConfig();
      setForm(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleChange = (
    section: keyof SystemConfigPayload,
    field: string,
    value: string | number | boolean
  ) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      } as any,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const updated = await updateSystemConfig(form);
      setForm(updated);
      setMessage('保存成功');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('确定要重置所有配置为默认值吗？此操作不可撤销。')) {
      return;
    }
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const reset = await resetSystemConfig();
      setForm(reset);
      setMessage('配置已重置为默认值');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTestApi = async (type: 'image' | 'video' | 'tts') => {
    setTestStatus((prev) => ({ ...prev, [type]: 'testing' }));
    setTestMessages((prev) => ({ ...prev, [type]: '' }));

    try {
      const apiKey = type === 'image' ? form.image.apiKey : type === 'video' ? form.video.apiKey : form.tts.apiKey;
      const model = type === 'image' ? form.image.model : type === 'video' ? form.video.model : form.tts.model;

      if (!apiKey) {
        setTestStatus((prev) => ({ ...prev, [type]: 'error' }));
        setTestMessages((prev) => ({ ...prev, [type]: '请先输入 API Key' }));
        return;
      }

      const result = await testApiConnection(type, apiKey, model);

      if (result.success) {
        setTestStatus((prev) => ({ ...prev, [type]: 'success' }));
        setTestMessages((prev) => ({ ...prev, [type]: result.message }));
      } else {
        setTestStatus((prev) => ({ ...prev, [type]: 'error' }));
        setTestMessages((prev) => ({ ...prev, [type]: result.error || '测试失败' }));
      }
    } catch (err) {
      setTestStatus((prev) => ({ ...prev, [type]: 'error' }));
      setTestMessages((prev) => ({ ...prev, [type]: err instanceof Error ? err.message : '测试失败' }));
    }
  };

  const toggleApiKeyVisibility = (key: string) => {
    setShowApiKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <IconSpinner className="w-8 h-8 text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">系统配置</h2>
          <p className="text-sm text-slate-400 mt-1">管理 API 配置、视频效果和音频设置</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleReset} className="btn btn-ghost flex items-center gap-2 text-amber-400 hover:text-amber-300">
            <IconReset className="w-4 h-4" />
            重置默认
          </button>
          <button type="button" onClick={loadData} className="btn btn-ghost flex items-center gap-2">
            <IconRefresh className="w-4 h-4" />
            重新加载
          </button>
        </div>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        {(error || message) && (
          <div
            className={`p-3 rounded-lg border ${
              error
                ? 'bg-red-500/10 border-red-500/20 text-red-300'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
            }`}
          >
            {error || (
              <span className="flex items-center gap-2">
                <IconCheck className="w-4 h-4" /> {message}
              </span>
            )}
          </div>
        )}

        {/* API Services */}
        <div className="space-y-4">
          <ApiSection
            title="图片生成"
            description="配置火山引擎图像生成服务"
            config={form.image}
            onChange={(field, value) => handleChange('image', field, value)}
            onTest={() => handleTestApi('image')}
            testStatus={testStatus.image}
            testMessage={testMessages.image}
            showApiKey={showApiKeys.image}
            onToggleApiKey={() => toggleApiKeyVisibility('image')}
            enableField={true}
          />

          <ApiSection
            title="视频生成"
            description="配置火山引擎 Seedance 视频模型"
            config={form.video}
            onChange={(field, value) => handleChange('video', field, value)}
            onTest={() => handleTestApi('video')}
            testStatus={testStatus.video}
            testMessage={testMessages.video}
            showApiKey={showApiKeys.video}
            onToggleApiKey={() => toggleApiKeyVisibility('video')}
            enableField={true}
          />

          <ApiSection
            title="语音生成"
            description="配置 MiniMax 语音模型与默认声音"
            config={form.tts}
            onChange={(field, value) => handleChange('tts', field, value)}
            onTest={() => handleTestApi('tts')}
            testStatus={testStatus.tts}
            testMessage={testMessages.tts}
            showApiKey={showApiKeys.tts}
            onToggleApiKey={() => toggleApiKeyVisibility('tts')}
            enableField={false}
            showVoiceId={true}
            showExtraFields={true}
          />
        </div>

        {/* Video Effects */}
        {/* <ConfigSection
          title="视频效果"
          description="配置镜头动态效果和字幕显示"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ToggleField
              label="启用镜头动态效果"
              value={form.videoEffects?.enableMovement ?? true}
              onChange={(v) => handleChange('videoEffects', 'enableMovement', v)}
            />
            <SelectField
              label="运动模式"
              value={form.videoEffects?.movementType || 'zoom_in'}
              onChange={(v) => handleChange('videoEffects', 'movementType', v)}
              options={[
                { value: 'random', label: '随机' },
                { value: 'zoom_in', label: '放大' },
                { value: 'zoom_out', label: '缩小' },
                { value: 'pan_left', label: '向左平移' },
                { value: 'pan_right', label: '向右平移' },
                { value: 'pan_up', label: '向上平移' },
                { value: 'pan_down', label: '向下平移' },
              ]}
            />
            <NumberField
              label="缩放比例"
              value={form.videoEffects?.zoomRatio ?? 1.12}
              onChange={(v) => handleChange('videoEffects', 'zoomRatio', v)}
              min={1.0}
              max={2.0}
              step={0.01}
            />
            <NumberField
              label="水平平移距离 (像素)"
              value={form.videoEffects?.panXRange ?? 50}
              onChange={(v) => handleChange('videoEffects', 'panXRange', v)}
              min={0}
              max={200}
              step={10}
            />
            <NumberField
              label="垂直平移距离 (像素)"
              value={form.videoEffects?.panYRange ?? 50}
              onChange={(v) => handleChange('videoEffects', 'panYRange', v)}
              min={0}
              max={200}
              step={10}
            />
            <ToggleField
              label="显示字幕"
              value={form.videoEffects?.enableSubtitle ?? false}
              onChange={(v) => handleChange('videoEffects', 'enableSubtitle', v)}
            />
          </div>
        </ConfigSection> */}

        {/* Audio Effects */}
        {/* <ConfigSection
          title="音频效果"
          description="配置背景音乐和音效设置"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ToggleField
              label="启用背景音乐"
              value={form.audioEffects?.enableBgm ?? true}
              onChange={(v) => handleChange('audioEffects', 'enableBgm', v)}
            />
            <NumberField
              label="背景音乐音量"
              value={form.audioEffects?.bgmVolume ?? 0.2}
              onChange={(v) => handleChange('audioEffects', 'bgmVolume', v)}
              min={0}
              max={1}
              step={0.05}
            />
            <ToggleField
              label="循环播放背景音乐"
              value={form.audioEffects?.bgmLoop ?? true}
              onChange={(v) => handleChange('audioEffects', 'bgmLoop', v)}
            />
            <NumberField
              label="淡入时长 (秒)"
              value={form.audioEffects?.bgmFadein ?? 2.0}
              onChange={(v) => handleChange('audioEffects', 'bgmFadein', v)}
              min={0}
              max={10}
              step={0.5}
            />
            <NumberField
              label="淡出时长 (秒)"
              value={form.audioEffects?.bgmFadeout ?? 3.0}
              onChange={(v) => handleChange('audioEffects', 'bgmFadeout', v)}
              min={0}
              max={10}
              step={0.5}
            />
          </div>
        </ConfigSection> */}

        {/* Timing */}
        {/* <ConfigSection
          title="时序配置"
          description="配置分镜时长和转场效果"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <NumberField
              label="基础时长 (秒)"
              value={form.timing?.baseDuration ?? 3.0}
              onChange={(v) => handleChange('timing', 'baseDuration', v)}
              min={1}
              max={10}
              step={0.5}
            />
            <NumberField
              label="每字符阅读时长 (秒)"
              value={form.timing?.charsPerSecond ?? 0.25}
              onChange={(v) => handleChange('timing', 'charsPerSecond', v)}
              min={0.1}
              max={1}
              step={0.05}
            />
            <NumberField
              label="最小时长 (秒)"
              value={form.timing?.minDuration ?? 2.0}
              onChange={(v) => handleChange('timing', 'minDuration', v)}
              min={1}
              max={5}
              step={0.5}
            />
            <NumberField
              label="最大时长 (秒)"
              value={form.timing?.maxDuration ?? 8.0}
              onChange={(v) => handleChange('timing', 'maxDuration', v)}
              min={3}
              max={30}
              step={1}
            />
            <NumberField
              label="转场时长 (秒)"
              value={form.timing?.transitionDuration ?? 0.1}
              onChange={(v) => handleChange('timing', 'transitionDuration', v)}
              min={0}
              max={2}
              step={0.1}
            />
          </div>
        </ConfigSection> */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="btn btn-primary min-w-[120px] flex items-center justify-center gap-2"
            disabled={saving}
          >
            {saving ? (
              <>
                <IconSpinner className="w-4 h-4" /> 保存中...
              </>
            ) : (
              '保存配置'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

interface ApiSectionProps {
  title: string;
  description: string;
  config: any;
  onChange: (field: string, value: string | number | boolean) => void;
  onTest: () => void;
  testStatus: TestStatus;
  testMessage: string;
  showApiKey: boolean;
  onToggleApiKey: () => void;
  enableField: boolean;
  showVoiceId?: boolean;
  showExtraFields?: boolean;
}

function ApiSection({
  title,
  description,
  config,
  onChange,
  onTest,
  testStatus,
  testMessage,
  showApiKey,
  onToggleApiKey,
  enableField,
  showVoiceId = false,
  showExtraFields = false,
}: ApiSectionProps) {
  return (
    <section className="card p-5 bg-[#0f172a]/70 border border-white/10 rounded-xl space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-slate-400 mt-1">{description}</p>
        </div>
        <button
          type="button"
          onClick={onTest}
          disabled={testStatus === 'testing'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs hover:bg-indigo-500/20 disabled:opacity-50"
        >
          {testStatus === 'testing' ? (
            <>
              <IconSpinner className="w-3 h-3" /> 测试中...
            </>
          ) : (
            <>
              <IconTest className="w-3 h-3" /> 测试连接
            </>
          )}
        </button>
      </div>

      {testMessage && (
        <div
          className={`text-xs p-2 rounded ${
            testStatus === 'success'
              ? 'bg-emerald-500/10 text-emerald-300'
              : 'bg-red-500/10 text-red-300'
          }`}
        >
          {testMessage}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {enableField && (
          <Field
            label="启用"
            type="checkbox"
            checked={config.enable}
            onCheckedChange={(v) => onChange('enable', v)}
          />
        )}
        {showVoiceId && (
          <Field
            label="声音 ID"
            placeholder="例如 Chinese (Mandarin)_Unrestrained_Young_Man"
            value={config.voiceId}
            onChange={(v) => onChange('voiceId', v)}
          />
        )}
        <Field
          label="模型名称"
          placeholder="例如 speech-2.6-hd"
          value={config.model}
          onChange={(v) => onChange('model', v)}
        />
        <div className="md:col-span-2">
          <PasswordField
            label="API Key"
            value={config.apiKey}
            onChange={(v) => onChange('apiKey', v)}
            show={showApiKey}
            onToggle={onToggleApiKey}
          />
        </div>
        {showExtraFields && (
          <>
            <NumberField
              label="语速"
              value={config.speed}
              onChange={(v) => onChange('speed', v)}
              min={0.5}
              max={2}
              step={0.1}
            />
            <NumberField
              label="音量"
              value={config.vol}
              onChange={(v) => onChange('vol', v)}
              min={0}
              max={1}
              step={0.1}
            />
          </>
        )}
      </div>
    </section>
  );
}

// interface ConfigSectionProps {
//   title: string;
//   description: string;
//   children: ReactNode;
// }

// function ConfigSection({ title, description, children }: ConfigSectionProps) {
//   return (
//     <section className="card p-5 bg-[#0f172a]/70 border border-white/10 rounded-xl space-y-4">
//       <div>
//         <h3 className="text-sm font-semibold text-white">{title}</h3>
//         <p className="text-xs text-slate-400 mt-1">{description}</p>
//       </div>
//       {children}
//     </section>
//   );
// }

interface FieldProps {
  label: string;
  value?: string | number | boolean;
  onChange?: (value: string) => void;
  onCheckedChange?: (value: boolean) => void;
  type?: string;
  placeholder?: string;
  checked?: boolean;
}

function Field({ label, value, onChange, onCheckedChange, type = 'text', placeholder, checked }: FieldProps) {
  if (type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          checked={checked as boolean}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          className="w-4 h-4 rounded bg-[#1e293b] border-white/10 text-indigo-500 focus:ring-2 focus:ring-indigo-500"
        />
        <span>{label}</span>
      </label>
    );
  }

  return (
    <label className="block text-sm text-slate-300">
      <span className="mb-2 block text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type={type}
        value={value as string | number}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full px-4 py-2.5 rounded-lg bg-[#1e293b] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </label>
  );
}

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
}

function PasswordField({ label, value, onChange, show, onToggle }: PasswordFieldProps) {
  return (
    <label className="block text-sm text-slate-300">
      <span className="mb-2 block text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-2.5 pr-10 rounded-lg bg-[#1e293b] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
        >
          {show ? <IconEye className="w-4 h-4" /> : <IconEyeOff className="w-4 h-4" />}
        </button>
      </div>
    </label>
  );
}

// interface ToggleFieldProps {
//   label: string;
//   value: boolean;
//   onChange: (value: boolean) => void;
// }

// function ToggleField({ label, value, onChange }: ToggleFieldProps) {
//   return (
//     <label className="flex items-center justify-between text-sm text-slate-300">
//       <span className="mb-2 block text-xs uppercase tracking-wide text-slate-500">{label}</span>
//       <button
//         type="button"
//         onClick={() => onChange(!value)}
//         className={`relative w-12 h-6 rounded-full transition-colors ${
//           value ? 'bg-indigo-500' : 'bg-slate-600'
//         }`}
//       >
//         <span
//           className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
//             value ? 'left-7' : 'left-1'
//           }`}
//         />
//       </button>
//     </label>
//   );
// }

// interface SelectFieldProps {
//   label: string;
//   value: string;
//   onChange: (value: string) => void;
//   options: { value: string; label: string }[];
// }

// function SelectField({ label, value, onChange, options }: SelectFieldProps) {
//   return (
//     <label className="block text-sm text-slate-300">
//       <span className="mb-2 block text-xs uppercase tracking-wide text-slate-500">{label}</span>
//       <select
//         value={value}
//         onChange={(e) => onChange(e.target.value)}
//         className="w-full px-4 py-2.5 rounded-lg bg-[#1e293b] border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
//       >
//         {options.map((opt) => (
//           <option key={opt.value} value={opt.value}>
//             {opt.label}
//           </option>
//         ))}
//       </select>
//     </label>
//   );
// }

// interface NumberFieldProps {
//   label: string;
//   value: number;
//   onChange: (value: number) => void;
//   min: number;
//   max: number;
//   step: number;
// }

// function NumberField({ label, value, onChange, min, max, step }: NumberFieldProps) {
//   return (
//     <label className="block text-sm text-slate-300">
//       <span className="mb-2 block text-xs uppercase tracking-wide text-slate-500">{label}</span>
//       <input
//         type="number"
//         value={value}
//         min={min}
//         max={max}
//         step={step}
//         onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
//         className="w-full px-4 py-2.5 rounded-lg bg-[#1e293b] border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
//       />
//     </label>
//   );
// }

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

function NumberField({ label, value, onChange, min, max, step }: NumberFieldProps) {
  return (
    <label className="block text-sm text-slate-300">
      <span className="mb-2 block text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-4 py-2.5 rounded-lg bg-[#1e293b] border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </label>
  );
}
