import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '../../..');
const spaceDir = path.resolve(workspaceRoot, 'assets/space');

function buildStoredAssetFileName(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${uniqueSuffix}${ext}`;
}

const router = Router();
let db = null;

export function initAssetRoutes(database) {
  db = database;
  return router;
}

router.get('/', (req, res) => {
  try {
    const { type, category, sort, order } = req.query;
    const assets = db.listAssets({ type, category, sort, order });
    res.json({ assets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/categories', (req, res) => {
  try {
    res.json({ categories: db.listAssetCategories() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload', async (req, res) => {
  try {
    const file = req.files?.file;
    if (!file) return res.status(400).json({ error: '未上传文件' });
    if (!fs.existsSync(spaceDir)) fs.mkdirSync(spaceDir, { recursive: true });
    const ext = path.extname(file.name);
    const fileName = buildStoredAssetFileName(file.name);
    await file.mv(path.join(spaceDir, fileName));
    const type = /\.(mp4|mov|webm|avi)$/i.test(ext) ? 'video' : /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(ext) ? 'audio' : 'image';
    const id = db.createAsset({
      name: file.name, file_path: `assets/space/${fileName}`,
      type, size: file.size, source: 'upload',
      category: req.body?.category || '',
    });
    res.json(db.getAsset(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const asset = db.getAsset(req.params.id);
    if (!asset) return res.status(404).json({ error: '资产不存在' });
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '名称不能为空' });
    db.renameAsset(asset.id, name.trim());
    res.json(db.getAsset(asset.id));
  } catch (err) {
    res.status(err.message === '资产名称已存在' ? 409 : 500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const asset = db.getAsset(req.params.id);
    if (!asset) return res.status(404).json({ error: '资产不存在' });
    const absPath = path.resolve(workspaceRoot, asset.file_path);
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    db.deleteAsset(asset.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/from-output', (req, res) => {
  try {
    const { name, file_path, type, source } = req.body;
    if (!file_path) return res.status(400).json({ error: '缺少文件路径' });
    const absPath = path.resolve(workspaceRoot, file_path);
    const size = fs.existsSync(absPath) ? fs.statSync(absPath).size : 0;
    const id = db.createAsset({
      name: name || path.basename(file_path),
      file_path, type: type || 'video', size, source: source || 'system',
    });
    res.json(db.getAsset(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
