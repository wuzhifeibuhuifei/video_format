/**
 * 用 Whisper 重新生成项目所有镜头的字幕时间戳
 * 直接对已有音频文件做语音识别，不重新调用 TTS API
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadConfig } from './lib/config.js';
import { WhisperClient } from './lib/whisper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../../config.toml');
const config = loadConfig(configPath);
const dbRelativePath = config.database?.path || 'data/projects.db';
const projectRoot = path.join(__dirname, '../..');
const dbPath = path.join(projectRoot, dbRelativePath);

const PROJECT_ID = 64;

const db = new Database(dbPath);
const whisper = new WhisperClient();

const shots = db.prepare(
  'SELECT id, display_index, script_text, audio_path, metadata_json FROM shots WHERE project_id = ? ORDER BY display_index'
).all(PROJECT_ID);

console.log(`项目 ${PROJECT_ID} 共 ${shots.length} 个镜头\n`);

for (const shot of shots) {
  const idx = shot.display_index;
  console.log(`--- Shot ${idx} (id: ${shot.id}) ---`);

  if (!shot.script_text || shot.script_text.trim() === '') {
    console.log('  跳过：空文本\n');
    continue;
  }

  // 数据库中的路径是相对于项目根目录的，需要加上 server 目录
  const audioPath = shot.audio_path
    ? path.join(projectRoot, 'remotion-video/server', shot.audio_path.replace(/^assets[\\/]/, 'assets/'))
    : null;

  if (!audioPath || !fs.existsSync(audioPath)) {
    console.log(`  跳过：音频不存在 (${audioPath})\n`);
    continue;
  }

  console.log(`  文本: ${shot.script_text.substring(0, 40)}...`);
  console.log(`  音频: ${audioPath}`);

  try {
    const result = await whisper.transcribe(audioPath);
    let timestamps = whisper.alignWithOriginalText(
      result,
      shot.script_text,
      'punctuation'
    );

    // 去除尾部标点
    timestamps = timestamps.map(ts => ({
      ...ts,
      text: ts.text.replace(/[，。！？；、,\.!\?;]+$/g, '').trim(),
    }));

    const metadata = { subtitleTimestamps: timestamps };
    db.prepare('UPDATE shots SET metadata_json = ? WHERE id = ?')
      .run(JSON.stringify(metadata), shot.id);

    console.log(`  ✓ Whisper 生成 ${timestamps.length} 条时间戳`);
    timestamps.forEach((t, i) => {
      console.log(`    [${i}] "${t.text.substring(0, 30)}" ${t.startMs.toFixed(1)} ~ ${t.endMs.toFixed(1)}ms`);
    });
  } catch (err) {
    console.error(`  ✗ 失败: ${err.message}`);
  }

  console.log();
}

db.close();
console.log('完成！');
