import { getConfig } from './config.js';
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class WhisperClient {
    constructor() {
        this.refreshConfig();
    }

    refreshConfig() {
        const config = getConfig();
        this.whisperConfig = config.whisper || {};
        this.apiKey = this.whisperConfig.api_key || process.env.OPENAI_API_KEY || '';
        this.model = this.whisperConfig.model || 'whisper-1';
        this.language = this.whisperConfig.language || 'zh';
        this.timestampGranularity = this.whisperConfig.timestamp_granularity || 'word';
        this.useLocal = this.whisperConfig.use_local !== false; // 默认使用本地
    }

    /**
     * 使用 Whisper 识别音频并获取时间戳
     * 支持两种模式: OpenAI API 或本地 faster-whisper
     * @param {string} audioPath - 音频文件路径
     * @returns {Promise<{text: string, words: Array, segments: Array}>}
     */
    async transcribe(audioPath) {
        if (this.useLocal) {
            return this._transcribeLocal(audioPath);
        } else {
            return this._transcribeAPI(audioPath);
        }
    }

    /**
     * 使用本地 faster-whisper Python 脚本识别
     */
    async _transcribeLocal(audioPath) {
        if (!fs.existsSync(audioPath)) {
            throw new Error(`Audio file not found: ${audioPath}`);
        }

        console.log(`[Whisper] 使用本地模型识别: ${audioPath}`);

        const scriptPath = path.join(__dirname, '../scripts/whisper_transcribe.py');
        const modelSize = this.whisperConfig.model_size || 'base';
        const language = this.language;

        return new Promise((resolve, reject) => {
            const python = spawn('python', [scriptPath, audioPath, modelSize, language], {
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
            });

            let stdout = '';
            let stderr = '';

            python.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            python.stderr.on('data', (data) => {
                stderr += data.toString();
                // 实时输出 Python 日志
                process.stderr.write(data);
            });

            python.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Whisper process exited with code ${code}: ${stderr}`));
                    return;
                }

                try {
                    const result = JSON.parse(stdout);
                    if (result.error) {
                        reject(new Error(result.error));
                    } else {
                        console.log(`[Whisper] 本地识别完成:`, {
                            wordCount: result.words?.length || 0,
                            segmentCount: result.segments?.length || 0,
                        });
                        resolve(result);
                    }
                } catch (err) {
                    reject(new Error(`Failed to parse Whisper output: ${err.message}\nOutput: ${stdout}`));
                }
            });

            python.on('error', (err) => {
                reject(new Error(`Failed to start Python process: ${err.message}`));
            });
        });
    }

    /**
     * 使用 OpenAI Whisper API 识别
     */
    async _transcribeAPI(audioPath) {
        if (!this.apiKey) {
            throw new Error('Whisper API key not configured');
        }

        if (!fs.existsSync(audioPath)) {
            throw new Error(`Audio file not found: ${audioPath}`);
        }

        console.log(`[Whisper] 使用 OpenAI API 识别: ${audioPath}`);

        const formData = new FormData();
        formData.append('file', fs.createReadStream(audioPath));
        formData.append('model', this.model);
        formData.append('language', this.language);
        formData.append('response_format', 'verbose_json');
        formData.append('timestamp_granularities[]', this.timestampGranularity);

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                ...formData.getHeaders(),
            },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.text();
            console.error(`[Whisper] API 请求失败 (${response.status}):`, error);
            throw new Error(`Whisper API error: ${error}`);
        }

        const result = await response.json();

        console.log(`[Whisper] API 识别完成:`, {
            text: result.text?.substring(0, 50) + '...',
            wordCount: result.words?.length || 0,
            segmentCount: result.segments?.length || 0,
        });

        return result;
    }

    /**
     * 将 Whisper 识别结果与原文对齐,生成字幕时间戳
     * @param {object} whisperResult - Whisper 返回结果
     * @param {string} originalText - 原始文本
     * @param {string} splitPattern - 分句模式: 'punctuation' | 'whisper-segments'
     * @returns {Array<{text: string, startMs: number, endMs: number}>}
     */
    alignWithOriginalText(whisperResult, originalText, splitPattern = 'punctuation') {
        if (!whisperResult.words || whisperResult.words.length === 0) {
            console.warn('[Whisper] 没有单词级时间戳,使用段落级时间戳');
            return this._alignBySegments(whisperResult.segments, originalText);
        }

        if (splitPattern === 'whisper-segments') {
            // 直接使用 Whisper 的段落分割
            return this._alignBySegments(whisperResult.segments, originalText);
        }

        // 使用标点符号分割原文
        return this._alignByPunctuation(whisperResult.words, originalText);
    }

    /**
     * 使用 Whisper 段落级时间戳对齐
     */
    _alignBySegments(segments, originalText) {
        if (!segments || segments.length === 0) {
            return [{
                text: originalText,
                startMs: 0,
                endMs: 0,
            }];
        }

        return segments.map(seg => ({
            text: seg.text.trim(),
            startMs: seg.start * 1000,
            endMs: seg.end * 1000,
        }));
    }

    /**
     * 按字符计数对齐：按原文每句的字符数从 Whisper 词列表中顺序消费对应数量的词
     * 不依赖文本内容匹配，避免繁简体差异和识别误差导致的匹配失败
     */
    _alignByPunctuation(words, originalText) {
        const sentences = this._splitBySentence(originalText);
        const stripPunct = (text) => text.replace(/[\s，。！？；、,\.!?;《》""''「」\u3000]/g, '');

        // 预处理：去除每个 Whisper 词的标点，计算纯字符数
        const cleanWords = words.map(w => ({
            ...w,
            clean: stripPunct(w.word),
        }));

        const result = [];
        let wordCursor = 0;

        for (const sentence of sentences) {
            const targetLen = stripPunct(sentence).length;

            if (targetLen === 0) {
                result.push({ text: sentence, startMs: 0, endMs: 0 });
                continue;
            }

            // 从当前游标开始累积 Whisper 词，直到字符数 >= 目标
            let accumulated = 0;
            const startIdx = wordCursor;

            while (wordCursor < cleanWords.length && accumulated < targetLen) {
                accumulated += cleanWords[wordCursor].clean.length;
                wordCursor++;
            }

            const endIdx = wordCursor - 1;

            if (startIdx < cleanWords.length && endIdx >= startIdx) {
                result.push({
                    text: sentence,
                    startMs: cleanWords[startIdx].start * 1000,
                    endMs: cleanWords[endIdx].end * 1000,
                });
            } else {
                result.push({ text: sentence, startMs: 0, endMs: 0 });
            }
        }

        return result;
    }

    /**
     * 按标点符号分割文本
     */
    _splitBySentence(text) {
        const parts = text.split(/(?<=[，。！？；、,\\.!\\?;])/);
        return parts.filter((s) => s.trim().length > 0);
    }
}
