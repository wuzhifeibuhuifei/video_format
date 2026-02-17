import fs from 'fs';
import path from 'path';
import toml from 'toml';

let config = null;
let baseConfig = null;
let configPathRef = null;
let overridePath = null;

function cloneDeep(obj) {
  return obj ? JSON.parse(JSON.stringify(obj)) : {};
}

function deepMerge(target, source) {
  if (!source) return target;
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      deepMerge(target[key], value);
    } else if (value !== undefined) {
      target[key] = value;
    }
  }
  return target;
}

function ensureOverridePath(configPath) {
  configPathRef = configPath;
  overridePath = path.join(path.dirname(configPath), 'config.override.json');
}

function loadOverrides() {
  if (!overridePath || !fs.existsSync(overridePath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(overridePath, 'utf-8');
    return JSON.parse(content || '{}');
  } catch (err) {
    console.warn('Failed to parse config override file, ignoring:', err.message);
    return {};
  }
}

function saveOverrides(overrides) {
  if (!overridePath) return;
  fs.writeFileSync(overridePath, JSON.stringify(overrides, null, 2), 'utf-8');
}

function rebuildConfig() {
  const overrides = loadOverrides();
  config = deepMerge(cloneDeep(baseConfig), overrides);
}

export function loadConfig(configPath) {
  if (config && configPathRef === configPath) return config;

  const content = fs.readFileSync(configPath, 'utf-8');
  baseConfig = toml.parse(content);
  ensureOverridePath(configPath);
  rebuildConfig();
  return config;
}

export function getConfig() {
  if (!config) {
    throw new Error('Config not loaded');
  }
  return config;
}

export function getEditableConfig() {
  const cfg = getConfig();
  return {
    image: {
      model: cfg.volcengine_image?.model_endpoint || '',
      apiKey: cfg.volcengine_image?.api_key || cfg.volcengine?.api_key || '',
      enable: cfg.volcengine_image?.enable ?? true,
    },
    video: {
      model: cfg.volcengine_video?.model_endpoint || '',
      apiKey: cfg.volcengine_video?.api_key || cfg.volcengine?.api_key || '',
      enable: cfg.volcengine_video?.enable ?? true,
    },
    tts: {
      voiceId: cfg.minimax_speech?.voice_setting?.voice_id || '',
      apiKey: cfg.minimax_speech?.api_key || '',
      model: cfg.minimax_speech?.model || '',
      speed: cfg.minimax_speech?.voice_setting?.speed || 1.1,
      vol: cfg.minimax_speech?.voice_setting?.vol || 1.0,
    },
    videoEffects: {
      enableMovement: cfg.video_effects?.enable_movement ?? true,
      movementType: cfg.video_effects?.movement_type || 'zoom_in',
      zoomRatio: cfg.video_effects?.zoom_ratio ?? 1.12,
      panXRange: cfg.video_effects?.pan_x_range ?? 50,
      panYRange: cfg.video_effects?.pan_y_range ?? 50,
      enableSubtitle: cfg.video_effects?.enable_subtitle ?? false,
    },
    audioEffects: {
      enableBgm: cfg.audio_effects?.enable_bgm ?? true,
      bgmVolume: cfg.audio_effects?.bgm_volume ?? 0.2,
      bgmLoop: cfg.audio_effects?.bgm_loop ?? true,
      bgmFadein: cfg.audio_effects?.bgm_fadein ?? 2.0,
      bgmFadeout: cfg.audio_effects?.bgm_fadeout ?? 3.0,
    },
    timing: {
      baseDuration: cfg.timing?.base_duration ?? 3.0,
      charsPerSecond: cfg.timing?.chars_per_second ?? 0.25,
      minDuration: cfg.timing?.min_duration ?? 2.0,
      maxDuration: cfg.timing?.max_duration ?? 8.0,
      transitionDuration: cfg.timing?.transition_duration ?? 0.1,
    },
  };
}

export function updateEditableConfig(updates = {}) {
  if (!baseConfig) {
    throw new Error('Config not loaded');
  }

  const overrides = loadOverrides();

  if (updates.image) {
    overrides.volcengine_image = overrides.volcengine_image || {};
    if (updates.image.model !== undefined) {
      overrides.volcengine_image.model_endpoint = updates.image.model;
    }
    if (updates.image.apiKey !== undefined) {
      overrides.volcengine_image.api_key = updates.image.apiKey;
    }
    if (updates.image.enable !== undefined) {
      overrides.volcengine_image.enable = updates.image.enable;
    }
  }

  if (updates.video) {
    overrides.volcengine_video = overrides.volcengine_video || {};
    if (updates.video.model !== undefined) {
      overrides.volcengine_video.model_endpoint = updates.video.model;
    }
    if (updates.video.apiKey !== undefined) {
      overrides.volcengine_video.api_key = updates.video.apiKey;
    }
    if (updates.video.enable !== undefined) {
      overrides.volcengine_video.enable = updates.video.enable;
    }
  }

  if (updates.tts) {
    overrides.minimax_speech = overrides.minimax_speech || {};
    overrides.minimax_speech.voice_setting = overrides.minimax_speech.voice_setting || {};
    if (updates.tts.voiceId !== undefined) {
      overrides.minimax_speech.voice_setting.voice_id = updates.tts.voiceId;
    }
    if (updates.tts.apiKey !== undefined) {
      overrides.minimax_speech.api_key = updates.tts.apiKey;
    }
    if (updates.tts.model !== undefined) {
      overrides.minimax_speech.model = updates.tts.model;
    }
    if (updates.tts.speed !== undefined) {
      overrides.minimax_speech.voice_setting.speed = updates.tts.speed;
    }
    if (updates.tts.vol !== undefined) {
      overrides.minimax_speech.voice_setting.vol = updates.tts.vol;
    }
  }

  if (updates.videoEffects) {
    overrides.video_effects = overrides.video_effects || {};
    if (updates.videoEffects.enableMovement !== undefined) {
      overrides.video_effects.enable_movement = updates.videoEffects.enableMovement;
    }
    if (updates.videoEffects.movementType !== undefined) {
      overrides.video_effects.movement_type = updates.videoEffects.movementType;
    }
    if (updates.videoEffects.zoomRatio !== undefined) {
      overrides.video_effects.zoom_ratio = updates.videoEffects.zoomRatio;
    }
    if (updates.videoEffects.panXRange !== undefined) {
      overrides.video_effects.pan_x_range = updates.videoEffects.panXRange;
    }
    if (updates.videoEffects.panYRange !== undefined) {
      overrides.video_effects.pan_y_range = updates.videoEffects.panYRange;
    }
    if (updates.videoEffects.enableSubtitle !== undefined) {
      overrides.video_effects.enable_subtitle = updates.videoEffects.enableSubtitle;
    }
  }

  if (updates.audioEffects) {
    overrides.audio_effects = overrides.audio_effects || {};
    if (updates.audioEffects.enableBgm !== undefined) {
      overrides.audio_effects.enable_bgm = updates.audioEffects.enableBgm;
    }
    if (updates.audioEffects.bgmVolume !== undefined) {
      overrides.audio_effects.bgm_volume = updates.audioEffects.bgmVolume;
    }
    if (updates.audioEffects.bgmLoop !== undefined) {
      overrides.audio_effects.bgm_loop = updates.audioEffects.bgmLoop;
    }
    if (updates.audioEffects.bgmFadein !== undefined) {
      overrides.audio_effects.bgm_fadein = updates.audioEffects.bgmFadein;
    }
    if (updates.audioEffects.bgmFadeout !== undefined) {
      overrides.audio_effects.bgm_fadeout = updates.audioEffects.bgmFadeout;
    }
  }

  if (updates.timing) {
    overrides.timing = overrides.timing || {};
    if (updates.timing.baseDuration !== undefined) {
      overrides.timing.base_duration = updates.timing.baseDuration;
    }
    if (updates.timing.charsPerSecond !== undefined) {
      overrides.timing.chars_per_second = updates.timing.charsPerSecond;
    }
    if (updates.timing.minDuration !== undefined) {
      overrides.timing.min_duration = updates.timing.minDuration;
    }
    if (updates.timing.maxDuration !== undefined) {
      overrides.timing.max_duration = updates.timing.maxDuration;
    }
    if (updates.timing.transitionDuration !== undefined) {
      overrides.timing.transition_duration = updates.timing.transitionDuration;
    }
  }

  saveOverrides(overrides);
  rebuildConfig();
  return getEditableConfig();
}

export function resetConfig() {
  if (!overridePath) return getEditableConfig();
  try {
    fs.unlinkSync(overridePath);
    rebuildConfig();
    return getEditableConfig();
  } catch (err) {
    console.warn('Failed to reset config:', err.message);
    return getEditableConfig();
  }
}
