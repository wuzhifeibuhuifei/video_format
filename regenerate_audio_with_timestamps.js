/**
 * 重新生成项目音频并保存字幕时间戳
 * 用法: node regenerate_audio_with_timestamps.js <project_id>
 */

import { ProjectDatabase } from './remotion-video/server/lib/database.js';
import { TTSClient } from './remotion-video/server/lib/tts.js';
import path from 'path';
import fs from 'fs';

const projectId = parseInt(process.argv[2]);

if (!projectId) {
    console.error('用法: node regenerate_audio_with_timestamps.js <project_id>');
    process.exit(1);
}

const db = new ProjectDatabase();
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

    const audioRoot = 'assets/audio/generated';

    for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        const shotIndex = shot.display_index || shot.index || (i + 1);

        // 跳过空文本段落
        if (!shot.script_text || shot.script_text.trim() === '') {
            console.log(`[${i + 1}/${shots.length}] Shot ${shotIndex}: 跳过空文本段落`);
            continue;
        }

        console.log(`[${i + 1}/${shots.length}] Shot ${shotIndex}: ${shot.script_text.substring(0, 30)}...`);

        const audioPath = path.join(audioRoot, `project_${projectId}_shot_${shotIndex}.mp3`);

        // 删除旧音频文件(如果存在)
        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
            console.log(`  ✓ 已删除旧音频文件`);
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
                    audio_path: audioPath,
                    metadata_json: JSON.stringify(metadata)
                });
                console.log(`  ✓ 字幕时间戳已保存: ${ttsResult.subtitleTimestamps.length} 条`);
            } else {
                console.log(`  ⚠ TTS API 未返回字幕时间戳`);
                db.updateShot(shot.id, { audio_path: audioPath });
            }
        } catch (err) {
            console.error(`  ✗ 生成失败: ${err.message}`);
        }
    }

    console.log(`\n✅ 音频重新生成完成!`);
    console.log(`\n下一步: 重新渲染视频`);
}

main().catch(err => {
    console.error('错误:', err);
    process.exit(1);
});
