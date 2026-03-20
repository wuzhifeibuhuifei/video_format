# Openclaw 读书解析视频渲染 API 接入文档

本文档描述了如何通过本系统的 API 创建并渲染“读书解析”（Book Analysis）模式的解说视频。
主要流程包含：创建项目加载文案、上传背景/音效素材、发起渲染任务、轮询任务状态。

---

## 一、 快速开始与核心流程概述

1. **创建项目**：通过单次请求，提交类别（`category: "book_analysis"`）及多段文案文本，系统会自动分割段落并初始化所需数据。
2. **设置资源 (可选)**：可以设置全局或段落的独立背景（图片/MP4），也可以指定某个段落的定制重点音效文件。
3. **提交渲染**：将拼装好的项目送入渲染队列。
4. **轮询状态**：利用查询进度的接口定期轮询渲染的到达状态（通常经历：TTS生成 -> 背景/音频预处理 -> 最终整合及字幕烧录）。
5. **获取成品文件**：完成时可获取视频、字幕文件及其包含合成字幕的最终版MP4。

注意：所有需要写操作的接口通常需在 HTTP Header 中附带认证字段（如 `Authorization: Basic XXX` —— 基于前端代码封装逻辑）。

---

## 二、 接口描述详情

### 1. 创建读书解析项目并载入脚本
在发起请求时，带上大段的解说文本（换行符分割），后端接口会直接创建分镜并填入剧本内容。

*   **Endpoint**: `POST /api/projects`
*   **Content-Type**: `application/json`
*   **Request Payload 示例**:

```json
{
  "theme": "百年孤独-读书解析",      // (可选) 项目名称
  "aspect_ratio": "9:16",             // (可选) 画面比例，默认 16:9，竖屏多用 9:16
  "category": "book_analysis",        // (必填) 指定创建为“读书解析”项目
  "enable_subtitle": true,            // (可选) 默认 true，生成并最终烧录字幕
  "audio_effects": {                  // (可选) 音效配置
    "enable_bgm": true,               // 是否开启背景音乐
    "bgm_volume": 0.2                 // 背景音乐音量大小 (0 ~ 1)
  },
  "insight_text": "第一段解说内容...\n第二段解说内容...\n第三段解说内容..." // (核心可选) 填入完整的解说大纲文案，系统会自动按照换行符将其拆分成多个连续的分镜(Shots)
}
```

*   **关于背景音乐的特别说明**：
    当前 API 的项目级别参数仅支持**控制背景音乐的开关（`enable_bgm`）和音量大小（`bgm_volume`）**。
    至于**具体的背景音乐文件（`bgm_path`）**，系统目前不支持通过项目 API 单独上传或指定。所有的项目实际上会统一读取应用服务器后台 `config.toml` 全局配置中预设的 BGM 共用文件。如果你需要修改背景音乐本身，只能去修改服务器后端的系统设置，暂不能实现单个项目(Project)维度的 BGM 动态下发。

*   **返回**: 返回一个完整的 `Project` 对象（JSON格式），其中关键属性是 `id`，它是后续该项目所有操作的前提。

> 如果你想手动、逐个增删改查段落（而非一开始通过 `insight_text` 全量创建），可以后续调用对 Shot 操作的高级接口，如 `POST /api/projects/:projectId/shots` 等。

---

### 2. 设置项目级别（全局）背景配置
在读书解析视频中，通常以一张书籍封面、插画图或是循环的环境短视频作为主干背景。若不设置默认可能只有黑屏底板。
*   **Endpoint**: `POST /api/projects/:projectId/background`
*   **Content-Type**: `multipart/form-data`
*   **表单字段**: `file` （你要上传的背景图片 `.jpg/.png` 或背景视频 `.mp4`）

*(进阶用法：你也可以调用 `POST /api/projects/:projectId/background-from-asset` 将资产空间中已经上传的文件赋值给项目，Payload 为 `{ "file_path": "assets/..." }` )*

---

### 3. 配置段落（Shot级）专用音效或背景
如果某些段落（Shot）的内容极其关键，需要有特别的重点标注特效或音效，或是切换背景来制造视觉反差。可以使用这些接口（需要明确知道该 Shot 的 `id`）：
*   **段落独立背景**: `POST /api/projects/:projectId/shots/:shotId/background`
*   **段落突语音效**: `POST /api/projects/:projectId/shots/:shotId/highlight-sfx`

这两个接口同样均为 `multipart/form-data`（字段名为 `file`）的上传接口；或使用带有 `-from-asset` 后缀的变体指向现存服务器资产。

---

### 4. 发起主渲染流水线任务
该接口执行一旦确认，对应的项目状态就会变更为排队及渲染中，系统后台自动化进行音频生成、时间轴对其和 Remix 渲染。
*   **Endpoint**: `POST /api/projects/:projectId/confirm`
*   **请求结果**: 如果返回 HTTP 200 即为渲染指令启动成功，此时该视频任务已经分配并开始生成。

---

### 5. 获取/轮询进度的回调与状态验证
系统依赖长轮询来跟进真实完成度。Openclaw 建议每 2-5 秒轮询一次该项目当前状态。
*   **Endpoint**: `GET /api/projects/:projectId/progress`
*   **返回示例**:

```json
{
  "status": "running", // 或 "idle" / "error"
  "progress": {
    "current": 40,
    "total": 100,
    "stage": "tts", // 正在做的子流水线：如 tts, video, render, burn等
    "percent": 40,
    "message": "生成语音 2/5"
  }
}
```

*当返回的 `status` 变为 `idle` （且无进度百分比刷新），即表示底层线程跑完了该项目的渲染池；如有报错则返回对应字段。*

---

### 6. 获取最终产物状态及链接
渲染完成后，直接请求查询当前项目详情。
*   **Endpoint**: `GET /api/projects/:projectId`
*   **核心响应字段提取**:
    *   `video_path`: 输出的洁净版原片（不带有系统硬压的底层字幕）绝对相对路径。
    *   `subtitle_path`: 与音频轴吻合的 `.srt` 格式分离式字幕文件。
    *   `video_with_subtitles_path`: **最常用**，经过系统字体配置及 `highlight_text` 高亮特效烧录完毕的带有字幕的硬压视频产物。

客户端可根据上述返回的路径参数，补齐 `http(s)://` 系统域名前缀完成成品的下载或分发。
