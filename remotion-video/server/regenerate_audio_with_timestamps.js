/**
 * 重新生成项目音频并保存字幕时间戳
 * 用法: node regenerate_audio_with_timestamps.js <project_id>
 */

import { ProjectDatabase } from './lib/database.js';
import { TTSClient } from './lib/tts.js';
import { loadConfig } from './lib/config.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const projectId = parseInt(process.argv[2]);

if (!projectId) {
    console.error('用法: node regenerate_audio_with_timestamps.js <project_id>');
    process.exit(1);
}

// 加载配置并初始化数据库
const configPath = path.join(__dirname, '../../config.toml');
const config = loadConfig(configPath);
const dbRelativePath = config.database?.path || 'data/projects.db';
const dbPath = path.join(__dirname, '../..', dbRelativePath);

console.log(`正在从以下位置加载数据库: ${dbPath}`);
const db = new ProjectDatabase(dbPath);
const tts = new TTSClient();

async function main() {
    const project = db.getProject(projectId);
    if (!project) {
        console.error(`项目 ${projectId} 不存在`);
        process.exit(1);
    }

    const shots = project.shots || [];
    console.log(`\n项目 ${projectId}: ${project.theme}`);
    console.log(`共 ${shots.length} 个段落\n`);

    // 注意：在 server 目录下运行，audioRoot 需要相对于 server 目录
    // 根据 AGENT.md, assets 在根目录，server 也在 remotion-video/ 下
    // 路径结构：root/assets/audio/generated
    // 脚本位置：root/remotion-video/server/
    const audioRoot = path.resolve('../../assets/audio/generated');

    for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        const shotIndex = shot.display_index || shot.index || (i + 1);

        // 跳过空文本段落
        if (!shot.script_text || shot.script_text.trim() === '') {
            console.log(`[${i + 1}/${shots.length}] Shot ${shotIndex}: 跳过空文本段落`);
            continue;
        }

        console.log(`[${i + 1}/${shots.length}] Shot ${shotIndex}: ${shot.script_text.substring(0, 30)}...`);

        const audioFileName = `project_${projectId}_shot_${shotIndex}.mp3`;
        const audioPath = path.join(audioRoot, audioFileName);
        // 数据库中存储的相对路径（相对于根目录或 server 预期的路径）
        // 正常 render.js 使用的是 path.join(audioRoot, ...) 其中 audioRoot 是 config 中的
        const dbAudioPath = `assets/audio/generated/${audioFileName}`;

        // 删除旧音频文件(如果存在)
        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
            console.log(`  ✓ 已删除旧音频文件: ${audioPath}`);
        }

        try {
            // 重新生成音频
            const ttsResult = await tts.synthesize(shot.script_text, audioPath, {
                voice_id: shot.voice_id
            });

            console.log(`  ✓ 音频已生成: ${audioPath}`);

            // 保存字幕时间戳到数据库
            if (ttsResult.subtitleTimestamps) {
                const metadata = { subtitleTimestamps: ttsResult.subtitleTimestamps };
                db.updateShot(shot.id, {
                    audio_path: dbAudioPath,
                    metadata_json: JSON.stringify(metadata)
                });
                console.log(`  ✓ 字幕时间戳已保存: ${ttsResult.subtitleTimestamps.length} 条`);
            } else {
                console.log(`  ⚠ TTS API 未返回字幕时间戳`);
                db.updateShot(shot.id, { audio_path: dbAudioPath });
            }
        } catch (err) {
            console.error(`  ✗ 生成失败: ${err.message}`);
        }
    }

    console.log(`\n✅ 音频重新生成完成!`);
    console.log(`\n下一步: 重新渲染项目 ${projectId}`);
}

main().catch(err => {
    console.error('错误:', err);
    process.exit(1);
});
