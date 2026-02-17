# 本地 Whisper 安装指南

## 免费的 Whisper 字幕时间戳生成

使用 `faster-whisper` 在本地运行 Whisper 模型,完全免费,无需 API 密钥。

---

## 安装步骤

### 1. 安装 Python 依赖

```bash
# 安装 faster-whisper
pip install faster-whisper

# 或使用国内镜像加速
pip install faster-whisper -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 2. 验证安装

```bash
# 测试 Python 脚本
cd remotion-video/server
python scripts/whisper_transcribe.py --help
```

### 3. 配置

`config.toml` 已默认配置为使用本地模式:

```toml
[whisper]
enable = true
use_local = true           # 使用本地模式
model_size = "base"        # 模型大小
language = "zh"            # 中文
split_pattern = "punctuation"  # 按标点符号分割
```

---

## 模型选择

| 模型 | 大小 | 内存需求 | 速度 | 准确度 |
|------|------|----------|------|--------|
| tiny | ~75MB | ~1GB | 最快 | 较低 |
| base | ~150MB | ~1GB | 快 | 中等 |
| small | ~500MB | ~2GB | 中等 | 良好 |
| medium | ~1.5GB | ~5GB | 慢 | 很好 |
| large-v3 | ~3GB | ~10GB | 最慢 | 最佳 |

**推荐**:

- **CPU 用户**: 使用 `base` 或 `small`
- **GPU 用户**: 使用 `medium` 或 `large-v3`

---

## GPU 加速 (可选)

如果有 NVIDIA GPU,可以大幅提升速度:

### 安装 CUDA 支持

```bash
# 安装 cuBLAS 和 cuDNN
pip install nvidia-cublas-cu12 nvidia-cudnn-cu12
```

### 修改 Python 脚本

编辑 `remotion-video/server/scripts/whisper_transcribe.py`:

```python
# 将这一行:
model = WhisperModel(model_size, device="cpu", compute_type="int8")

# 改为:
model = WhisperModel(model_size, device="cuda", compute_type="float16")
```

---

## 使用方法

### 测试 Whisper

```bash
cd remotion-video/server
node test_whisper.js
```

### 为项目生成字幕

```bash
node regenerate_audio_with_timestamps.js 63
```

---

## 性能对比

### 本地 vs API

| 项目 | 本地 (base) | OpenAI API |
|------|-------------|------------|
| 成本 | 免费 | $0.006/分钟 |
| 速度 | 1-2x 实时 (CPU) | ~5秒 |
| 隐私 | 完全本地 | 上传到云端 |
| 依赖 | Python | 网络连接 |

### 识别速度示例

- **1分钟音频** (base 模型, CPU):
  - Intel i7: ~60-90秒
  - Apple M1: ~30-45秒
  - NVIDIA RTX 3060: ~10-15秒

---

## 故障排除

### 问题 1: Python 未找到

```bash
# Windows
where python

# 如果没有,安装 Python 3.8+
# 下载: https://www.python.org/downloads/
```

### 问题 2: faster-whisper 安装失败

```bash
# 升级 pip
python -m pip install --upgrade pip

# 重新安装
pip install faster-whisper --no-cache-dir
```

### 问题 3: 识别速度太慢

- 使用更小的模型 (`tiny` 或 `base`)
- 启用 GPU 加速
- 减少 `vad_filter` 参数

### 问题 4: 中文识别不准确

- 使用更大的模型 (`medium` 或 `large-v3`)
- 确保音频质量良好
- 尝试调整 `split_pattern` 为 `whisper-segments`

---

## 切换到 API 模式

如果需要使用 OpenAI API:

```toml
[whisper]
enable = true
use_local = false          # 切换到 API 模式
api_key = "sk-..."         # 填入 API 密钥
```

---

## 下一步

1. 安装 Python 依赖
2. 运行 `node test_whisper.js` 测试
3. 为项目 63 重新生成字幕
4. 在前端验证字幕同步效果
