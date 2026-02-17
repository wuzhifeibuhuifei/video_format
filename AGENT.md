# Agent **Context** for Video Format Demo

This file provides context and guidelines for AI agents working on this project.

## Project Overview

**Video Format Demo** is a video generation system that leverages AI to create videos from text prompts. It uses **Node.js + Remotion** for rendering, **Express.js** for the backend orchestration, and **React + Vite** for the frontend UI.

**Core Capabilities:**
- **Storyboard Generation**: Uses Volcengine/DeepSeek LLM to create scripts and prompts.
- **Asset Generation**:
  - **Images**: Volcengine Image API or ComfyUI.
  - **Voice**: MiniMax Speech API (TTS) and voice cloning.
  - **Video**: Volcengine Video API (Doubao-Seedance).
- **Video Rendering**: Remotion engine with dynamic compositions.
- **Persistence**: SQLite database (`better-sqlite3`).

## Tech Stack

- **Frontend (`frontend/`)**:
  - React 18
  - Vite
  - Tailwind CSS
  - Zustand (State Management)
  - `@remotion/player` (Video Preview)

- **Backend (`remotion-video/server/`)**:
  - Node.js (ES Modules)
  - Express.js
  - SQLite (`better-sqlite3`)
  - `toml` (Configuration)

- **Video Engine (`remotion-video/`)**:
  - Remotion v4
  - React-based video composition (`VideoComposition.tsx`)
  - `@remotion/bundler`, `@remotion/renderer`

## Project Structure

- `frontend/`: React + Vite Web UI source code.
- `remotion-video/`: Remotion project root.
  - `server/`: Express backend API server.
    - `lib/`: Core logic modules.
      - `storyboard.js`: LLM orchestration.
      - `image.js`: Image generation API integration.
      - `tts.js`: Text-to-Speech API integration.
      - `video.js`: Video generation logic.
      - `database.js`: SQLite storage handling.
    - `routes/`: Express API endpoints.
  - `src/`: Remotion video compositions (`VideoComposition.tsx`).
- `data/`: SQLite database storage (`projects.db`).
- `assets/`: Generated media (audio, images).
- `outputs/`: Final rendered video files.
- `config.toml`: Central configuration file.
- `BAOTA_DEPLOYMENT.md`: Deployment guide for Baota Panel.
- `deploy-centos8.sh`: Automated deployment script for CentOS 8.

## Development Workflow

### 1. Installation

```bash
# Install Backend Dependencies
cd remotion-video/server
npm install

# Install Remotion Dependencies
cd remotion-video
npm install

# Install Frontend Dependencies
cd frontend
npm install
```

### 2. Running the Development Environment

You typically need two terminal sessions:

**Terminal 1: Backend Server**
```bash
cd remotion-video/server
npm start
# Server runs on http://localhost:3001
```

**Terminal 2: Frontend UI**
```bash
cd frontend
npm run dev
# UI runs on http://localhost:5173
```

*Note: The Remotion Studio (`npm start` in `remotion-video`) is usually not needed unless debugging compositions directly.*

### 3. Key Configuration (`config.toml`)

The project relies heavily on `config.toml` for behavior control. Key sections include:
- `[volcengine]`: LLM and Image/Video API settings.
- `[minimax_speech]`: TTS API and voice cloning settings.
- `[video]`: Aspect ratio, transition duration, FPS.
- `[video_effects]`: Ken Burns effect settings (zoom, pan movement).
- `[audio_effects]`: BGM and SFX settings.
- `[workflow]`: Default generation settings (scene count, style, paths).
- `[comfyui]`: Integration with ComfyUI for local image generation.

**Important**: 
- Never commit real API keys to version control. 
- Use placeholders or environment variables if possible.
- The system expects `projects.db` to be in `data/`.

## Core Logic Flow

1.  **User Input**: User provides a topic/theme via Frontend.
2.  **Storyboard**: `remotion-video/server/lib/storyboard.js` asks LLM to generate scenes, scripts, and image prompts.
3.  **Asset Generation**:
    *   **Images**: `remotion-video/server/lib/image.js` calls Volcengine or ComfyUI.
    *   **Audio**: `remotion-video/server/lib/tts.js` calls MiniMax to generate speech for scripts.
    *   **Video**: `remotion-video/server/lib/video.js` calls Volcengine Video API.
4.  **Composition Store**: Data is saved to `projects.db` via `remotion-video/server/lib/database.js`. Frontend visualizes scenes.
5.  **Rendering**: Backend invokes Remotion to render the final MP4 based on the collected assets and timing data.

## Guidelines for AI Agents

1.  **File Paths**: Always use absolute paths when reading/writing files.
2.  **Configuration**: When adding new features, check `config.toml` and ensure new settings are properly configurable.
3.  **Database**: Do not manually edit `data/projects.db` directly unless necessary. Use the `ProjectDatabase` class methods.
4.  **Remotion**: Changes to video visual layout should happen in `remotion-video/src/VideoComposition.tsx` or components within `remotion-video/src/components/`.
5.  **Deployment**: Refer to `BAOTA_DEPLOYMENT.md` for server instructions. Use `deploy-centos8.sh` for quick server setup if applicable.
