import { Router } from 'express';

const router = Router();
let db = null;

export function initImageStyleRoutes(database) {
  db = database;
  return router;
}

// 获取所有画面风格
router.get('/', (req, res) => {
  try {
    const styles = db.listImageStyles();
    res.json({ styles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取单个画面风格
router.get('/:id', (req, res) => {
  try {
    const style = db.getImageStyle(parseInt(req.params.id));
    if (!style) {
      return res.status(404).json({ error: 'Style not found' });
    }
    res.json(style);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 创建画面风格
router.post('/', (req, res) => {
  try {
    const { name, prompt, negative_prompt, is_default } = req.body;
    if (!name || !prompt) {
      return res.status(400).json({ error: '名称和提示词不能为空' });
    }
    const id = db.createImageStyle({ name, prompt, negative_prompt, is_default });
    const style = db.getImageStyle(id);
    res.json(style);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新画面风格
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = db.getImageStyle(id);
    if (!existing) {
      return res.status(404).json({ error: 'Style not found' });
    }
    db.updateImageStyle(id, req.body);
    const style = db.getImageStyle(id);
    res.json(style);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除画面风格
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    db.deleteImageStyle(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
