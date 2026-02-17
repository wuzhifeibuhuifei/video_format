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
    // 迁移：添加角色形象字段到 projects 表
    this._migrateAddCharacterImage();
    // 迁移：添加读书解析相关字段到 projects 表
    this._migrateAddBookAnalysisFields();
    // 迁移：添加段落独立背景字段到 shots 表
    this._migrateAddShotBackgroundFields();
    // 迁移：添加重点文字标注字段到 shots 表
    this._migrateAddHighlightTextField();
    // 迁移：添加重点标注音效字段到 shots 表
    this._migrateAddHighlightSfxField();
    // 迁移：添加字幕文件路径字段到 shots 表
    this._migrateAddSubtitlePathField();
    // 迁移：添加字幕和烧录视频字段到 projects 表
    this._migrateAddProjectSubtitleFields();

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

    // 画面风格表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS image_styles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        negative_prompt TEXT DEFAULT '',
        is_default INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // 项目操作
  createProject(data) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const stmt = this.db.prepare(`
      INSERT INTO projects (theme, style, aspect_ratio, status, scene_count, config_json, category, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.theme,
      data.style || '',
      data.aspect_ratio || '16:9',
      data.status || 'draft',
      data.scene_count || 8,
      JSON.stringify(data.config || {}),
      data.category || 'emotion',
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
    return projects.map(p => {
      // 获取第一个镜头的文案作为预览
      const firstShot = this.db.prepare(
        'SELECT script_text FROM shots WHERE project_id = ? ORDER BY display_index LIMIT 1'
      ).get(p.id);
      return {
        ...p,
        config: JSON.parse(p.config_json || '{}'),
        preview_text: firstShot?.script_text || ''
      };
    });
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

  deleteShot(id) {
    const shot = this.db.prepare('SELECT project_id FROM shots WHERE id = ?').get(id);
    this.db.prepare('DELETE FROM shots WHERE id = ?').run(id);
    if (shot) {
      this.reindexShots(shot.project_id);
    }
  }

  reindexShots(projectId) {
    const shots = this.db.prepare(
      'SELECT id FROM shots WHERE project_id = ? ORDER BY display_index'
    ).all(projectId);
    const stmt = this.db.prepare('UPDATE shots SET display_index = ? WHERE id = ?');
    for (let i = 0; i < shots.length; i++) {
      stmt.run(i + 1, shots[i].id);
    }
  }

  deleteShots(projectId) {
    this.db.prepare('DELETE FROM shots WHERE project_id = ?').run(projectId);
  }

  // 画面风格操作
  createImageStyle(data) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const stmt = this.db.prepare(`
      INSERT INTO image_styles (name, prompt, negative_prompt, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.name,
      data.prompt,
      data.negative_prompt || '',
      data.is_default ? 1 : 0,
      now,
      now
    );
    return result.lastInsertRowid;
  }

  listImageStyles() {
    return this.db.prepare('SELECT * FROM image_styles ORDER BY id DESC').all();
  }

  getImageStyle(id) {
    return this.db.prepare('SELECT * FROM image_styles WHERE id = ?').get(id);
  }

  updateImageStyle(id, data) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(data)) {
      if (key === 'is_default') {
        fields.push('is_default = ?');
        values.push(value ? 1 : 0);
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    fields.push("updated_at = datetime('now')");
    values.push(id);
    const sql = `UPDATE image_styles SET ${fields.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...values);
  }

  deleteImageStyle(id) {
    this.db.prepare('DELETE FROM image_styles WHERE id = ?').run(id);
  }

  getDefaultImageStyle() {
    return this.db.prepare('SELECT * FROM image_styles WHERE is_default = 1').get();
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

  // 数据库迁移：添加角色形象字段
  _migrateAddCharacterImage() {
    const columns = this.db.pragma('table_info(projects)');
    const columnNames = columns.map(c => c.name);

    // 添加 character_image 字段
    if (!columnNames.includes('character_image')) {
      this.db.exec('ALTER TABLE projects ADD COLUMN character_image TEXT');
    }
  }

  // 数据库迁移：添加读书解析相关字段
  _migrateAddBookAnalysisFields() {
    const columns = this.db.pragma('table_info(projects)');
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('category')) {
      this.db.exec("ALTER TABLE projects ADD COLUMN category TEXT DEFAULT 'emotion'");
    }
    if (!columnNames.includes('background_type')) {
      this.db.exec('ALTER TABLE projects ADD COLUMN background_type TEXT');
    }
    if (!columnNames.includes('background_path')) {
      this.db.exec('ALTER TABLE projects ADD COLUMN background_path TEXT');
    }
  }

  // 数据库迁移：添加段落独立背景字段
  _migrateAddShotBackgroundFields() {
    const columns = this.db.pragma('table_info(shots)');
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('background_path')) {
      this.db.exec('ALTER TABLE shots ADD COLUMN background_path TEXT');
    }
    if (!columnNames.includes('background_type')) {
      this.db.exec('ALTER TABLE shots ADD COLUMN background_type TEXT');
    }
  }

  // 数据库迁移：添加重点文字标注字段
  _migrateAddHighlightTextField() {
    const columns = this.db.pragma('table_info(shots)');
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('highlight_text')) {
      this.db.exec('ALTER TABLE shots ADD COLUMN highlight_text TEXT');
    }
  }

  // 数据库迁移：添加重点标注自定义音效字段
  _migrateAddHighlightSfxField() {
    const columns = this.db.pragma('table_info(shots)');
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('highlight_sfx_path')) {
      this.db.exec('ALTER TABLE shots ADD COLUMN highlight_sfx_path TEXT');
    }
  }

  // 迁移：添加字幕文件路径字段
  _migrateAddSubtitlePathField() {
    const columns = this.db.pragma('table_info(shots)');
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('subtitle_path')) {
      this.db.exec('ALTER TABLE shots ADD COLUMN subtitle_path TEXT');
    }
  }

  // 迁移：添加字幕和烧录视频字段到 projects 表
  _migrateAddProjectSubtitleFields() {
    const columns = this.db.pragma('table_info(projects)');
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('subtitle_path')) {
      this.db.exec('ALTER TABLE projects ADD COLUMN subtitle_path TEXT');
    }
    if (!columnNames.includes('video_with_subtitles_path')) {
      this.db.exec('ALTER TABLE projects ADD COLUMN video_with_subtitles_path TEXT');
    }
  }
}
