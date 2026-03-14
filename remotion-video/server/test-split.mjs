import { splitHighlightAsSentence } from './routes/shots.js';

const cases = [
  // [描述, scriptText, highlightText, 期望结果]
  ['重点词在中间，前后无标点',       '今天天气很好阳光明媚万里无云',   '阳光明媚', '今天天气很好，阳光明媚，万里无云'],
  ['重点词在开头，后面无标点',       '阳光明媚万里无云',               '阳光明媚', '阳光明媚，万里无云'],
  ['重点词在结尾，前面无标点',       '今天天气很好阳光明媚',           '阳光明媚', '今天天气很好，阳光明媚'],
  ['重点词前已有逗号',               '今天天气很好，阳光明媚万里无云', '阳光明媚', '今天天气很好，阳光明媚，万里无云'],
  ['重点词后已有句号',               '今天天气很好阳光明媚。万里无云', '阳光明媚', '今天天气很好，阳光明媚。万里无云'],
  ['重点词本身就是整段文字',         '阳光明媚',                       '阳光明媚', '阳光明媚'],
  ['重点词前后都有标点（无需修改）', '今天，阳光明媚。万里无云',       '阳光明媚', '今天，阳光明媚。万里无云'],
  ['重点词不在文字中',               '今天天气很好',                   '阳光明媚', '今天天气很好'],
];

let passed = 0;
for (const [desc, script, highlight, expected] of cases) {
  const result = splitHighlightAsSentence(script, highlight);
  const ok = result === expected;
  console.log(`${ok ? '✓' : '✗'} ${desc}`);
  if (!ok) {
    console.log(`    输入:  "${script}" | 重点: "${highlight}"`);
    console.log(`    期望:  "${expected}"`);
    console.log(`    实际:  "${result}"`);
  }
  if (ok) passed++;
}
console.log(`\n结果: ${passed}/${cases.length} 通过`);
process.exit(passed === cases.length ? 0 : 1);
