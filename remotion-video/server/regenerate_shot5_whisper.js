/**
 * 使用 Whisper 为 Shot 5 重新生成细粒度字幕时间戳
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { WhisperClient } from './lib/whisper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function regenerateShot5() {
    const dbPath = path.join(__dirname, '../../data/projects.db');
    const db = new Database(dbPath);

    console.log('正在为 Shot 5 生成细粒度字幕时间戳...\n');

    // 获取 Shot 5 数据
    const shot = db.prepare(`
    SELECT id, display_index, script_text, metadata_json
    FROM shots 
    WHERE project_id = 63 AND display_index = 5
  `).get();

    if (!shot) {
        console.error('❌ 未找到 Shot 5');
        db.close();
        return;
    }

    console.log(`Shot ${shot.display_index}:`);
    console.log(`文本: ${shot.script_text}\n`);

    // 音频文件路径
    const audioPath = path.join(__dirname, '../../assets/audio/generated/project_63_shot_5.mp3');
    console.log(`音频文件: ${audioPath}\n`);

    try {
        // 使用 Whisper 识别
        const whisper = new WhisperClient();
        console.log('⏳ 正在使用 Whisper 识别音频...\n');

        const startTime = Date.now();
        const result = await whisper.transcribe(audioPath);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`✅ 识别完成 (耗时: ${duration}s)\n`);
        console.log(`📝 识别文本:\n${result.text}\n`);
        console.log(`📊 单词数: ${result.words?.length || 0}`);
        console.log(`📊 段落数: ${result.segments?.length || 0}\n`);

        // 使用标点符号分割对齐
        console.log('🔤 按标点符号分割并对齐时间戳...\n');
        const timestamps = whisper.alignWithOriginalText(
            result,
            shot.script_text,
            'punctuation'
        );

        console.log(`生成了 ${timestamps.length} 条字幕:\n`);
        timestamps.forEach((ts, i) => {
            const startSec = (ts.startMs / 1000).toFixed(2);
            const endSec = (ts.endMs / 1000).toFixed(2);
            console.log(`[${i + 1}] ${startSec}s - ${endSec}s`);
            console.log(`    ${ts.text}`);
            console.log('');
        });

        // 保存到数据库
        const metadataJson = JSON.stringify({ subtitleTimestamps: timestamps });
        db.prepare(`
      UPDATE shots 
      SET metadata_json = ? 
      WHERE id = ?
    `).run(metadataJson, shot.id);

        console.log('✅ 字幕时间戳已保存到数据库\n');

        // 验证保存
        const saved = db.prepare('SELECT metadata_json FROM shots WHERE id = ?').get(shot.id);
        const savedData = JSON.parse(saved.metadata_json);
        console.log(`✓ 验证: 数据库中有 ${savedData.subtitleTimestamps.length} 条时间戳`);

    } catch (error) {
        console.error('❌ 生成失败:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
    } finally {
        db.close();
    }
}

regenerateShot5();
