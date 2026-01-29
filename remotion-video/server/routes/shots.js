import { Router } from 'express';

const router = Router();
let db = null;

export function initShotRoutes(database) {
  db = database;
  return router;
}

// 更新项目的所有镜头
router.put('/:projectId/shots', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { shots } = req.body;

    for (const shot of shots) {
      db.updateShot(shot.id, {
        script_text: shot.script_text,
        image_prompt: shot.image_prompt,
        voice_id: shot.voice_id || '',
      });
    }

    const project = db.getProject(projectId);
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
