import { JimengImageGenerator } from './lib/jimeng.js';
import { loadConfig } from './lib/config.js';

loadConfig('../../config.toml');

const generator = new JimengImageGenerator();

try {
  console.log('开始测试即梦API生图...');

  const outputPath = await generator.generate(
    '一只可爱的橘猫，坐在窗台上，阳光洒在身上，温暖的画面',
    './assets/test-jimeng.png',
    {
      width: 1024,
      height: 1024,
      scale: 3.5
    }
  );

  console.log('✅ 生图成功！');
  console.log('图片路径:', outputPath);
} catch (error) {
  console.error('❌ 生图失败:', error.message);
  console.error(error);
}
