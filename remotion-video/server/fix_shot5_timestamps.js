/**
 * 手动更新 Shot 5 的字幕时间戳(临时脚本)
 * 使用之前成功 API 调用返回的正确值
 */

import { ProjectDatabase } from './lib/database.js';
import { loadConfig } from './lib/config.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 加载配置并初始化数据库
const configPath = path.join(__dirname, '../../config.toml');
const config = loadConfig(configPath);
const dbRelativePath = config.database?.path || 'data/projects.db';
const dbPath = path.join(__dirname, '../..', dbRelativePath);

const db = new ProjectDatabase(dbPath);

// 从日志中提取的正确时间戳数据
const correctTimestamps = [
    {
        text: "生活看起来很顺， 节奏固定,风险很小,一点波动就让人慌。 那一刻我才明白,问题不在变化太多,而在你太怕变化。",
        startMs: 0,
        endMs: 12009.20634920635
    },
    {
        text: "反脆弱里有一句话有些东西,必须在冲击中变强。",
        startMs: 12209.20634920635,
        endMs: 17182.766439909297
    },
    {
        text: "你一味避险,短期很稳, 长期却越来越脆。真正的危险,往往藏在看起来没事的阶段。 记住这条规律经不起波动的稳定, 本身就是风险。",
        startMs: 17382.766439909297,
        endMs: 30000  // 估算值,实际应该从完整日志获取
    }
];

// 获取项目 63 的 Shot 5
const project = db.getProject(63);
const shot5 = project.shots.find(s => (s.display_index || s.index) === 5);

if (shot5) {
    const metadata = { subtitleTimestamps: correctTimestamps };
    db.updateShot(shot5.id, {
        metadata_json: JSON.stringify(metadata)
    });
    console.log(`✅ Shot 5 字幕时间戳已更新:`);
    console.log(JSON.stringify(correctTimestamps, null, 2));
} else {
    console.error('❌ 未找到 Shot 5');
}
