/**
 * 检查项目的字幕时间戳数据
 * 用法: node check_subtitle_timestamps.js <project_id>
 */

import { ProjectDatabase } from './remotion-video/server/lib/database.js';

const projectId = parseInt(process.argv[2]);

if (!projectId) {
    console.error('用法: node check_subtitle_timestamps.js <project_id>');
    process.exit(1);
}

const db = new ProjectDatabase();

async function main() {
    const project = db.getProject(projectId);
    if (!project) {
        console.error(`项目 ${projectId} 不存在`);
        process.exit(1);
    }

    const shots = project.shots || [];
    console.log(`\n项目 ${projectId}: ${project.theme}`);
    console.log(`共 ${shots.length} 个段落\n`);

    let hasAnyTimestamps = false;

    for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        const shotIndex = shot.display_index || shot.index || (i + 1);

        console.log(`\nShot ${shotIndex}:`);
        console.log(`  文本: ${shot.script_text?.substring(0, 50) || '(空)'}...`);
        console.log(`  metadata_json: ${shot.metadata_json || '(null)'}`);

        if (shot.metadata_json) {
            try {
                const metadata = JSON.parse(shot.metadata_json);
                if (metadata.subtitleTimestamps) {
                    console.log(`  ✓ 字幕时间戳: ${metadata.subtitleTimestamps.length} 条`);
                    console.log(`    示例:`, metadata.subtitleTimestamps.slice(0, 2));
                    hasAnyTimestamps = true;
                } else {
                    console.log(`  ✗ metadata_json 中没有 subtitleTimestamps 字段`);
                }
            } catch (err) {
                console.log(`  ✗ 解析 metadata_json 失败: ${err.message}`);
            }
        } else {
            console.log(`  ✗ 没有 metadata_json 数据`);
        }
    }

    console.log(`\n${hasAnyTimestamps ? '✅' : '❌'} 项目${hasAnyTimestamps ? '有' : '没有'}字幕时间戳数据`);

    if (!hasAnyTimestamps) {
        console.log(`\n建议: 运行以下命令重新生成音频和字幕时间戳:`);
        console.log(`  node regenerate_audio_with_timestamps.js ${projectId}`);
    }
}

main().catch(err => {
    console.error('错误:', err);
    process.exit(1);
});
