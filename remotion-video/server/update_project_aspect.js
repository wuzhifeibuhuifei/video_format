import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/projects.db');

const db = new Database(dbPath);

// 更新项目 32 的宽高比为 16:9
const stmt = db.prepare('UPDATE projects SET aspect_ratio = ? WHERE id = ?');
const result = stmt.run('16:9', 32);

console.log(`✅ 已更新项目 32 的宽高比为 16:9`);
console.log(`   影响行数: ${result.changes}`);

// 验证更新
const project = db.prepare('SELECT id, theme, aspect_ratio FROM projects WHERE id = ?').get(32);
console.log(`\n当前项目信息:`);
console.log(`   ID: ${project.id}`);
console.log(`   主题: ${project.theme}`);
console.log(`   宽高比: ${project.aspect_ratio}`);

db.close();
