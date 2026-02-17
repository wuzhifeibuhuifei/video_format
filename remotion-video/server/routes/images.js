import { Router } from 'express';
import { ImageGenerator } from '../lib/image.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
let db = null;
let imageGen = null;

export function initImageRoutes(database) {
  db = database;
  imageGen = new ImageGenerator();
  return router;
}

// 生成项目所有图片
router.post('/:projectId/images', async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const missingOnly = req.query.missing_only === 'true';
  // 是否使用参考图片保持一致性（默认开启）
  const useReference = req.query.use_reference !== 'false';

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const shots = project.shots || [];
    let firstImagePath = null; // 第一张图片路径，用作后续图片的参考

    // 优先使用角色形象作为参考图片
    let characterImagePath = null;
    if (project.character_image) {
      characterImagePath = path.join(__dirname, '../', project.character_image);
      if (!fs.existsSync(characterImagePath)) {
        characterImagePath = null;
      }
    }

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      if (shot.image_prompt && shot.image_path) {
        // 将相对路径转换为绝对路径（相对于项目根目录）
        const absolutePath = path.join(__dirname, '../', shot.image_path);

        // 如果 missingOnly 为 true，跳过已存在的图片
        if (missingOnly && fs.existsSync(absolutePath)) {
          console.log(`Skipping existing image: ${shot.image_path}`);
          // 如果第一张图片已存在，记录其路径作为参考
          if (i === 0) {
            firstImagePath = absolutePath;
          }
          continue;
        }

        console.log(`Generating image for shot ${shot.display_index}: ${shot.image_path}`);

        // 确定参考图片：优先使用角色形象，其次使用第一张图片
        const options = {};
        if (useReference) {
          if (characterImagePath) {
            // 有角色形象时，所有图片都使用角色形象作为参考
            options.referenceImage = characterImagePath;
          } else if (i > 0 && firstImagePath && fs.existsSync(firstImagePath)) {
            // 没有角色形象时，后续图片使用第一张作为参考
            options.referenceImage = firstImagePath;
          }
        }

        await imageGen.generate(shot.image_prompt, absolutePath, options);

        // 记录第一张图片路径
        if (i === 0) {
          firstImagePath = absolutePath;
        }
      }
    }

    res.json(db.getProject(projectId));
  } catch (err) {
    console.error('Image generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 上传单个镜头图片
router.post('/:projectId/shots/:shotId/upload', async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const shotId = parseInt(req.params.shotId);

  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const shot = project.shots?.find(s => s.id === shotId);
    if (!shot) {
      return res.status(404).json({ error: 'Shot not found' });
    }

    const uploadedFile = req.files.image;
    // 将相对路径转换为绝对路径（相对于项目根目录）
    const targetPath = path.join(__dirname, '../', shot.image_path);

    // 确保目标目录存在
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 移动上传的文件到目标位置
    await uploadedFile.mv(targetPath);

    console.log(`Image uploaded for shot ${shot.display_index}: ${targetPath}`);

    res.json(db.getProject(projectId));
  } catch (err) {
    console.error('Image upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 重新生成单个镜头图片
router.post('/:projectId/shots/:shotId/image', async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const shotId = parseInt(req.params.shotId);
  // 是否使用参考图片保持一致性（默认开启）
  const useReference = req.query.use_reference !== 'false';

  try {
    const project = db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const shots = project.shots || [];
    const shot = shots.find(s => s.id === shotId);
    if (!shot) {
      return res.status(404).json({ error: 'Shot not found' });
    }

    if (shot.image_prompt && shot.image_path) {
      // 将相对路径转换为绝对路径（相对于项目根目录）
      const absolutePath = path.join(__dirname, '../', shot.image_path);
      const options = {};

      if (useReference) {
        // 优先使用角色形象作为参考图片
        if (project.character_image) {
          const characterImagePath = path.join(__dirname, '../', project.character_image);
          if (fs.existsSync(characterImagePath)) {
            options.referenceImage = characterImagePath;
          }
        } else {
          // 没有角色形象时，使用第一张图片作为参考
          const shotIndex = shots.findIndex(s => s.id === shotId);
          if (shotIndex > 0) {
            const firstShot = shots[0];
            if (firstShot.image_path) {
              const firstShotAbsolutePath = path.join(__dirname, '../', firstShot.image_path);
              if (fs.existsSync(firstShotAbsolutePath)) {
                options.referenceImage = firstShotAbsolutePath;
              }
            }
          }
        }
      }

      await imageGen.generate(shot.image_prompt, absolutePath, options);
    }

    res.json(db.getProject(projectId));
  } catch (err) {
    console.error('Single shot image generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
