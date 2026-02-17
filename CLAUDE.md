# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Node.js + Remotion** video generation system consisting of:
- **Backend**: Express.js server handling storyboard generation (LLM), image generation, TTS, and video rendering.
- **Frontend**: React + Vite Web UI for managing projects and editing shots.
- **Persistence**: SQLite database.

## Development Commands

### Setup
```bash
# Install backend dependencies
cd remotion-video/server
npm install

# Install frontend dependencies
cd frontend
npm install
```

### Server Execution
```bash
# Terminal 1: Start backend API (port 3001)
cd remotion-video/server
npm start

# Terminal 2: Start frontend UI (port 5173)
cd frontend
npm run dev
```

### Build
```bash
# Build frontend for production
cd frontend
npm run build
```

## Tech Stack & Architecture

### Backend (`remotion-video/server`)
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database**: `better-sqlite3` (SQLite)
- **Configuration**: `toml` (config.toml)
- **Video Processing**: `@remotion/bundler`, `@remotion/renderer`
- **AI Integrations**:
  - Storyboard: Volcengine/DeepSeek (LLM)
  - TTS: MiniMax Speech API
  - Images: Volcengine Image API

### Frontend (`frontend/`)
- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Video Preview**: `@remotion/player`

### Directory Structure
- `remotion-video/server/` - API server, database logic, and core libraries (`lib/`).
- `remotion-video/src/` - Remotion video compositions (React components used for rendering).
- `frontend/src/` - Web UI source code.
- `data/projects.db` - SQLite database file.
- `assets/` - Generated audio/images and static resources.
- `outputs/` - Final MP4 video files.
- `config.toml` - Central configuration for APIs and video settings.

## Core Logic & Data Flow
1. **Storyboard**: User inputs theme -> LLM generates script/prompts (`lib/storyboard.js`).
2. **Assets**: Images generated via API (`lib/image.js`) or manual upload. TTS generates audio (`lib/tts.js`).
3. **Composition**: Frontend edits shots -> Backend persists to DB.
4. **Render**: Backend calculates durations -> Passes props to Remotion -> Renders MP4 (`routes/render.js`).

## Configuration (`config.toml`)
- **API Keys**: Volcengine (LLM/Image), MiniMax (TTS).
- **Video Settings**: Aspect ratios, FPS, Codec.
- **Effects**: Ken Burns settings (`video_effects`), Background Music (`audio_effects`).

## Code Style & Rules
- **Formatting**: Adhere to existing ESLint/Prettier patterns if present.
- **Paths**: Use absolute paths for file operations when possible.
- **Context**: Use `Context7 MCP` for library/API documentation or complex logic generation.
- **Remotion**: Refer to remotion.dev for video composition patterns.
- **Filesystem**: Do not manually edit `projects.db`; use the `ProjectDatabase` class in `lib/database.js`.
- 用中文回答我
