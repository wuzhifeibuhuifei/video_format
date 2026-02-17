const Database = require('better-sqlite3');
const db = new Database('../../data/projects.db');

const project = db.prepare('SELECT * FROM projects WHERE id = 61').get();
const shots = db.prepare('SELECT * FROM shots WHERE project_id = 61 ORDER BY display_index').all();
const fps = 24;
const transitionFrames = Math.round(0.5 * fps); // 12 frames

console.log('=== 项目61 渲染模拟 ===');
console.log('fps:', fps, ', transitionFrames:', transitionFrames);
console.log('');

shots.forEach((s) => {
  const scriptText = s.script_text || '';
  const trimEmpty = scriptText.trim() === '';
  const jsTruthy = Boolean(scriptText);

  console.log('段落' + s.display_index + ':');
  console.log('  text: [' + scriptText.substring(0, 30) + ']');
  console.log('  trim()==="":', trimEmpty);
  console.log('  JS truthy (!!scriptText):', jsTruthy);
  console.log('  后端TTS跳过:', trimEmpty);
  console.log('  前端hasScriptText:', jsTruthy);
  console.log('  background_path:', s.background_path || '(无)');

  // 前端 activeShots 过滤逻辑
  const passFilter = Boolean(scriptText) || Boolean(s.background_path);
  console.log('  通过activeShots过滤:', passFilter);
  console.log('');
});

// 模拟 VideoComposition 中的 activeShots 过滤
const activeShots = shots.filter((s) => {
  const st = s.script_text || '';
  if (!st && !s.background_path) return false;
  return true;
});

console.log('=== activeShots 结果 ===');
console.log('原始shots数:', shots.length);
console.log('过滤后activeShots数:', activeShots.length);
activeShots.forEach((s) => {
  console.log('  段落' + s.display_index + ': text=[' + (s.script_text || '').substring(0, 15) + ']');
});

console.log('');
console.log('=== 关键发现 ===');
const shot3 = shots.find(s => s.display_index === 3);
if (shot3) {
  const t = shot3.script_text;
  console.log('段落3 script_text 字符码:', JSON.stringify(t));
  console.log('段落3 script_text 长度:', t ? t.length : 0);
  console.log('段落3 trim后长度:', t ? t.trim().length : 0);
  console.log('');
  console.log('后端: trim()==="" → true → TTS跳过 → 无音频');
  console.log('前端: !!scriptText → true (空格是truthy)');
  console.log('  → hasScriptText=true → 显示遮罩+字幕');
  console.log('  → isBackgroundOnly=false → 不播放背景原音');
  console.log('  → 这与需求3矛盾!');
}
