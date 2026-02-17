/**
 * 修复 Whisper 时间戳：确保时间戳覆盖整个音频时长
 * 用法: node fix_timestamps_to_audio_duration.js <project_id>
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadConfig } from './lib/config.js';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../../config.toml');
const config = loadConfig(configPath);
const dbRelativePath = config.database?.path || 'data/projects.db';
const projectRoot = path.join(__dirname, '../..');
const dbPath = path.join(projectRoot, dbRelativePath);

// 获取 bundled ffprobe 路径
const isLinux = process.platform === 'linux';
const bundledFfprobePath = isLinux
  ? '/usr/bin/ffprobe'
  : path.join(__dirname, './assets/ffmpeg/ffprobe.exe');

async function getAudioDurationSafe(audioPath) {
  if (!fs.existsSync(audioPath)) return null;
  try {
    const cmd = `"${bundledFfprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
    const result = execSync(cmd, { encoding: 'utf-8' }).trim();
    return parseFloat(result);
  } catch (err) {
    console.warn(`ffprobe 获取时长失败: ${err.message}`);
    return null;
  }
}

const PROJECT_ID = parseInt(process.argv[2]) || 64;
const db = new Database(dbPath);

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

  // 构造音频路径
  const audioPath = shot.audio_path
    ? path.join(projectRoot, 'remotion-video/server', shot.audio_path.replace(/^assets[\\/]/, 'assets/'))
    : null;

  if (!audioPath || !fs.existsSync(audioPath)) {
    console.log(`  跳过：音频不存在 (${audioPath})\n`);
    continue;
  }

  // 获取音频实际时长
  const audioDuration = await getAudioDurationSafe(audioPath);
  if (!audioDuration) {
    console.log('  跳过：无法获取音频时长\n');
    continue;
  }

  const audioDurationMs = audioDuration * 1000;
  console.log(`  音频时长: ${audioDuration.toFixed(3)}s (${audioDurationMs.toFixed(0)}ms)`);

  // 读取现有时间戳
  const metadata = JSON.parse(shot.metadata_json || '{}');
  let timestamps = metadata.subtitleTimestamps || [];

  if (timestamps.length === 0) {
    console.log('  跳过：无时间戳\n');
    continue;
  }

  const lastTs = timestamps[timestamps.length - 1];
  console.log(`  当前时间戳: 末句结束于 ${lastTs.endMs.toFixed(0)}ms`);

  if (lastTs.endMs < audioDurationMs - 50) {
    // 扩展最后一个时间戳以覆盖整个音频
    console.log(`  → 扩展时间戳到 ${audioDurationMs.toFixed(0)}ms`);

    // 如果最后一个时间戳的结束时间远早于音频结束，
    // 添加一个新的时间戳来表示音频末尾的静音
    const gap = audioDurationMs - lastTs.endMs;
    if (gap > 500) {
      // 间隔超过 500ms，添加一个静音时间戳
      timestamps.push({
        text: '',
        startMs: lastTs.endMs,
        endMs: audioDurationMs,
      });
    } else {
      // 间隔不大，直接扩展最后一个时间戳
      lastTs.endMs = audioDurationMs;
    }

    // 更新数据库
    metadata.subtitleTimestamps = timestamps;
    db.prepare('UPDATE shots SET metadata_json = ? WHERE id = ?')
      .run(JSON.stringify(metadata), shot.id);

    const newLast = timestamps[timestamps.length - 1];
    console.log(`  ✓ 已修复: 末句结束于 ${newLast.endMs.toFixed(0)}ms`);
  } else {
    console.log(`  ✓ 时间戳已覆盖整个音频`);
  }

  console.log();
}

db.close();
console.log('完成！');
