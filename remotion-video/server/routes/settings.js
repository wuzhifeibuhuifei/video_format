import { Router } from 'express';
import { getEditableConfig, updateEditableConfig, resetConfig } from '../lib/config.js';

const router = Router();

export function initSettingsRoutes() {
  return router;
}

// Get current system config
router.get('/system-config', (req, res) => {
  try {
    const data = getEditableConfig();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update system config
router.put('/system-config', (req, res) => {
  try {
    const { image, video, tts, videoEffects, audioEffects, timing } = req.body || {};
    const updated = updateEditableConfig({ image, video, tts, videoEffects, audioEffects, timing });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset config to defaults
router.post('/reset-config', (req, res) => {
  try {
    const reset = resetConfig();
    res.json(reset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test API connection
router.post('/test-api', async (req, res) => {
  try {
    const { type, apiKey, model } = req.body || {};

    let result = { success: false, message: '', error: '' };

    switch (type) {
      case 'image':
        result = await testVolcengineImageAPI(apiKey, model);
        break;
      case 'video':
        result = await testVolcengineVideoAPI(apiKey, model);
        break;
      case 'tts':
        result = await testMiniMaxTTS(apiKey);
        break;
      default:
        result = { success: false, error: 'Invalid API type' };
    }

    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function testVolcengineImageAPI(apiKey, model) {
  if (!apiKey) {
    return { success: false, error: 'API Key is required' };
  }

  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-v3-2-251201',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      }),
    });

    if (response.ok || response.status === 400) {
      return { success: true, message: '连接成功：API Key 有效' };
    } else {
      const text = await response.text();
      return { success: false, error: `API 测试失败 (${response.status}): ${text}` };
    }
  } catch (err) {
    return { success: false, error: `连接失败: ${err.message}` };
  }
}

async function testVolcengineVideoAPI(apiKey, model) {
  if (!apiKey) {
    return { success: false, error: 'API Key is required' };
  }

  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-v3-2-251201',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      }),
    });

    if (response.ok || response.status === 400) {
      return { success: true, message: '连接成功：API Key 有效' };
    } else {
      const text = await response.text();
      return { success: false, error: `API 测试失败 (${response.status}): ${text}` };
    }
  } catch (err) {
    return { success: false, error: `连接失败: ${err.message}` };
  }
}

async function testMiniMaxTTS(apiKey) {
  if (!apiKey) {
    return { success: false, error: 'API Key is required' };
  }

  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://api.minimaxi.com/v1/text/audio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        text: 'test',
        model: 'speech-01',
        stream: false,
      }),
    });

    if (response.ok || response.status === 400 || response.status === 401) {
      return { success: true, message: '连接成功：API Key 有效' };
    } else {
      const text = await response.text();
      return { success: false, error: `API 测试失败 (${response.status}): ${text}` };
    }
  } catch (err) {
    return { success: false, error: `连接失败: ${err.message}` };
  }
}

export default router;
