import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";

const WHISPER_PATH = path.join(process.cwd(), "whisper.cpp");
const WHISPER_VERSION = "1.5.5";
const MODEL = "medium";

const SHOTS = [
  { name: "shot1", file: "project_60_shot_1.mp3" },
  { name: "shot2", file: "project_60_shot_2.mp3" },
  { name: "shot4", file: "project_60_shot_4.mp3" },
  { name: "shot5", file: "project_60_shot_5.mp3" },
];

async function main() {
  const captionsDir = path.join(process.cwd(), "public", "captions");
  if (!fs.existsSync(captionsDir)) {
    fs.mkdirSync(captionsDir, { recursive: true });
  }

  console.log("Installing Whisper.cpp...");
  await installWhisperCpp({
    to: WHISPER_PATH,
    version: WHISPER_VERSION,
  });

  console.log(`Downloading model: ${MODEL}...`);
  await downloadWhisperModel({
    model: MODEL,
    folder: WHISPER_PATH,
  });

  const tempDir = path.join(process.cwd(), "temp-wav");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  for (const shot of SHOTS) {
    const inputPath = path.join(
      process.cwd(),
      "public",
      "radios",
      shot.file
    );
    const wavPath = path.join(tempDir, `${shot.name}.wav`);
    const outputPath = path.join(
      process.cwd(),
      "public",
      "captions",
      `${shot.name}.json`
    );

    console.log(`Converting ${shot.file} to 16KHz WAV...`);
    execSync(
      `npx remotion ffmpeg -i "${inputPath}" -ar 16000 "${wavPath}" -y`,
      { stdio: "inherit" }
    );

    console.log(`Transcribing ${shot.name}...`);

    const whisperCppOutput = await transcribe({
      model: MODEL,
      whisperPath: WHISPER_PATH,
      whisperCppVersion: WHISPER_VERSION,
      inputPath: wavPath,
      tokenLevelTimestamps: true,
      language: "zh",
    });

    const { captions } = toCaptions({
      whisperCppOutput,
    });

    fs.writeFileSync(
      outputPath,
      JSON.stringify(captions, null, 2)
    );

    console.log(`Saved captions to ${outputPath}`);
  }

  console.log("All transcriptions complete!");
}

main().catch((error) => {
  console.error("Transcription failed:", error);
  process.exit(1);
});
