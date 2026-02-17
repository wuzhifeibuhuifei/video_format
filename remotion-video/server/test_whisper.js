/**
 * 测试 Whisper 字幕时间戳生成
 * 使用项目 63 的 Shot 5 音频文件
 */

import { WhisperClient } from './lib/whisper.js';
import { loadConfig } from './lib/config.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testWhisper() {
    // 加载配置
    const configPath = path.join(__dirname, '../../config.toml');
    const config = loadConfig(configPath);

    // 检查 Whisper 配置
    if (!config.whisper?.enable) {
        console.error('❌ Whisper 未启用,请在 config.toml 中设置 whisper.enable = true');
        return;
    }

    const useLocal = config.whisper?.use_local !== false; // 默认使用本地

    if (!useLocal && !config.whisper?.api_key && !process.env.OPENAI_API_KEY) {
        console.error('❌ Whisper API key 未配置,请在 config.toml 中设置 whisper.api_key');
        console.log('或设置环境变量: export OPENAI_API_KEY=sk-...');
        console.log('或设置 whisper.use_local = true 使用免费本地模式');
        return;
    }

    // 测试音频文件
    const audioPath = path.join(__dirname, '../../assets/audio/generated/project_63_shot_5.mp3');

    if (!fs.existsSync(audioPath)) {
        console.error(`❌ 音频文件不存在: ${audioPath}`);
        return;
    }

    console.log(`🎤 测试 Whisper 字幕时间戳生成 (${useLocal ? '本地模式' : 'API 模式'})\n`);
    console.log(`音频文件: ${audioPath}`);
    console.log(`文件大小: ${(fs.statSync(audioPath).size / 1024).toFixed(2)} KB\n`);

    // 原始文本
    const originalText = `生活看起来很顺， 节奏固定，风险很小，一点波动就让人慌。 那一刻我才明白，问题不在变化太多，而在你太怕变化。反脆弱里有一句话有些东西，必须在冲击中变强。你一味避险，短期很稳， 长期却越来越脆。真正的危险，往往藏在看起来没事的阶段。 记住这条规律经不起波动的稳定， 本身就是风险。`;

    try {
        const whisper = new WhisperClient();

        console.log(`⏳ 正在${useLocal ? '使用本地模型' : '调用 Whisper API'}识别...\n`);
        const startTime = Date.now();

        const result = await whisper.transcribe(audioPath);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ 识别完成 (耗时: ${duration}s)\n`);

        console.log('📝 识别文本:');
        console.log(result.text);
        console.log('');

        console.log(`📊 单词数: ${result.words?.length || 0}`);
        console.log(`📊 段落数: ${result.segments?.length || 0}`);
        console.log('');

        // 测试标点符号分割对齐
        console.log('🔤 测试标点符号分割对齐:\n');
        const punctuationTimestamps = whisper.alignWithOriginalText(
            result,
            originalText,
            'punctuation'
        );

        console.log(`生成了 ${punctuationTimestamps.length} 条字幕:\n`);
        punctuationTimestamps.forEach((ts, i) => {
            const startSec = (ts.startMs / 1000).toFixed(2);
            const endSec = (ts.endMs / 1000).toFixed(2);
            console.log(`[${i + 1}] ${startSec}s - ${endSec}s`);
            console.log(`    ${ts.text}`);
            console.log('');
        });

        // 测试 Whisper 段落分割
        console.log('📄 测试 Whisper 段落分割:\n');
        const segmentTimestamps = whisper.alignWithOriginalText(
            result,
            originalText,
            'whisper-segments'
        );

        console.log(`生成了 ${segmentTimestamps.length} 条字幕:\n`);
        segmentTimestamps.forEach((ts, i) => {
            const startSec = (ts.startMs / 1000).toFixed(2);
            const endSec = (ts.endMs / 1000).toFixed(2);
            console.log(`[${i + 1}] ${startSec}s - ${endSec}s`);
            console.log(`    ${ts.text}`);
            console.log('');
        });

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
    }
}

testWhisper();
