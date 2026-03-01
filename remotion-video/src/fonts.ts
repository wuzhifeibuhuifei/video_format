import { staticFile } from 'remotion';

const fontFamily = 'Noto Sans SC';
const fontUrl = staticFile('fonts/NotoSansSC-VariableFont_wght.ttf');

let fontPromise: Promise<void> | null = null;

export function ensureFont(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (fontPromise) return fontPromise;

  fontPromise = new Promise<void>((resolve) => {
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: '${fontFamily}';
        src: url('${fontUrl}') format('truetype');
        font-weight: 100 900;
        font-display: block;
      }
    `;
    document.head.appendChild(style);

    document.fonts.load(`900 48px "${fontFamily}"`, '中文测试').then(() => {
      resolve();
    }).catch(() => resolve());
  });

  return fontPromise;
}
