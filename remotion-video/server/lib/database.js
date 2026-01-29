import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export class ProjectDatabase {
  constructor(dbPath) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        theme TEXT NOT NULL,
        style TEXT,
        aspect_ratio TEXT DEFAULT '16:9',
        status TEXT DEFAULT 'draft',
        audio_path TEXT,
        video_path TEXT,
        config TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 迁移：添加视频相关字段到 shots 表
    this._migrateAddVideoFields();

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        "index" INTEGER NOT NULL,
        script_text TEXT NOT NULL,
        image_prompt TEXT,
        image_path TEXT,
        audio_path TEXT,
        voice_id TEXT,
        duration REAL,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      )
    `);
  }

  // 项目操作
  createProject(data) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const stmt = this.db.prepare(`
      INSERT INTO projects (theme, style, aspect_ratio, status, scene_count, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.theme,
      data.style || '',
      data.aspect_ratio || '16:9',
      data.status || 'draft',
      data.scene_count || 8,
      JSON.stringify(data.config || {}),
      now,
      now
    );
    return result.lastInsertRowid;
  }

  getProject(id) {
    const project = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!project) return null;
    project.config = JSON.parse(project.config_json || '{}');
    project.shots = this.getShots(id);
    return project;
  }

  listProjects() {
    const projects = this.db.prepare('SELECT * FROM projects ORDER BY id DESC').all();
    return projects.map(p => ({
      ...p,
      config: JSON.parse(p.config_json || '{}')
    }));
  }

  updateProject(id, data) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(data)) {
      if (key === 'config') {
        fields.push('config_json = ?');
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    fields.push("updated_at = datetime('now')");
    values.push(id);

    const sql = `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...values);
  }

  deleteProject(id) {
    this.db.prepare('DELETE FROM shots WHERE project_id = ?').run(id);
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  // 镜头操作
  createShot(data) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const stmt = this.db.prepare(`
      INSERT INTO shots (project_id, display_index, script_text, image_prompt, negative_prompt, image_path, voice_id, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.project_id,
      data.index || data.display_index,
      data.script_text,
      data.image_prompt || '',
      data.negative_prompt || '',
      data.image_path || '',
      data.voice_id || '',
      JSON.stringify(data.metadata || {}),
      now,
      now
    );
    return result.lastInsertRowid;
  }

  getShots(projectId) {
    const shots = this.db.prepare(
      'SELECT * FROM shots WHERE project_id = ? ORDER BY display_index'
    ).all(projectId);
    return shots;
  }

  updateShot(id, data) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push(`"${key}" = ?`);
      values.push(value);
    }
    values.push(id);
    const sql = `UPDATE shots SET ${fields.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...values);
  }

  deleteShots(projectId) {
    this.db.prepare('DELETE FROM shots WHERE project_id = ?').run(projectId);
  }

  close() {
    this.db.close();
  }

  // 数据库迁移：添加视频相关字段
  _migrateAddVideoFields() {
    const columns = this.db.pragma('table_info(shots)');
    const columnNames = columns.map(c => c.name);

    // 添加 video_prompt 字段
    if (!columnNames.includes('video_prompt')) {
      this.db.exec('ALTER TABLE shots ADD COLUMN video_prompt TEXT');
    }

    // 添加 video_path 字段
    if (!columnNames.includes('video_path')) {
      this.db.exec('ALTER TABLE shots ADD COLUMN video_path TEXT');
    }

    // 添加 video_status 字段 (pending/generating/completed/failed)
    if (!columnNames.includes('video_status')) {
      this.db.exec("ALTER TABLE shots ADD COLUMN video_status TEXT DEFAULT 'pending'");
    }
  }
}
