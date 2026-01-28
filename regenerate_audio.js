import { ProjectDatabase } from './remotion-video/server/lib/database.js';
import { TTSClient } from './remotion-video/server/lib/tts.js';
import { loadConfig } from './remotion-video/server/lib/config.js';
import path from 'path';

// Load config first
const configPath = path.join(process.cwd(), 'config.toml');
loadConfig(configPath);

const dbPath = path.join(process.cwd(), 'data', 'projects.db');
const db = new ProjectDatabase(dbPath);
const tts = new TTSClient();

const projectId = 41;
const shotNumbers = [9, 10, 11, 12, 13];

async function regenerateAudio() {
  const project = db.getProject(projectId);
  if (!project) {
    console.error(`Project ${projectId} not found`);
    process.exit(1);
  }

  const shots = project.shots;
  const audioRoot = path.join(process.cwd(), 'remotion-video', 'server', 'assets', 'audio', 'generated');

  for (const shotNum of shotNumbers) {
    // Find shot by display_index
    const shot = shots.find(s => s.display_index === shotNum);
    if (!shot) {
      console.warn(`Shot ${shotNum} not found in project ${projectId}`);
      continue;
    }

    const audioPath = path.join(audioRoot, `project_${projectId}_shot_${shotNum}.mp3`);
    console.log(`Regenerating audio for shot ${shotNum}...`);
    console.log(`  Text: ${shot.script_text}`);
    console.log(`  Output: ${audioPath}`);
    console.log(`  Voice ID: ${shot.voice_id || 'default'}`);

    try {
      await tts.synthesize(shot.script_text, audioPath, { voice_id: shot.voice_id });
      console.log(`  ✓ Successfully regenerated`);
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
    }
  }

  db.close();
}

regenerateAudio().catch(console.error);
