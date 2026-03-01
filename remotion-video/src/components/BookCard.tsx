import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Img, delayRender, continueRender } from 'remotion';
import type { BookCardProps } from '../types';
import { ensureFont } from '../fonts';

export const BookCard: React.FC<BookCardProps> = ({ imageSrc, backgroundSrc, bookName, subtitle }) => {
  const [handle] = useState(() => delayRender('等待字体加载'));

  useEffect(() => {
    ensureFont().then(() => {
      continueRender(handle);
    });
  }, [handle]);
  return (
    <AbsoluteFill
      style={{
        background: backgroundSrc ? '#000' : 'radial-gradient(ellipse at 30% 50%, #1a1a2e 0%, #0a0a0f 100%)',
        fontFamily: 'Noto Sans SC, sans-serif',
      }}
    >
      {backgroundSrc && (
        <Img src={backgroundSrc} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} />
      )}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 80px',
          gap: 80,
        }}
      >
      {/* 封面 */}
      <div
        style={{
          position: 'absolute',
          left: 440,
          top: '50%',
          transform: 'translateY(-50%)',
          boxShadow: '20px 20px 60px rgba(0,0,0,0.8)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <Img src={imageSrc} style={{ height: 500, objectFit: 'contain', display: 'block' }} />
      </div>

      {/* 书名 + 副标题 */}
      <div style={{ position: 'absolute', right: 300, top: '30%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div
          style={{  
            fontSize: 100, 
            fontWeight: 900,
            lineHeight: 1.2,
            color: '#f5c842',
            textShadow: '3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 0 0 #000, -3px 0 0 #000, 0 3px 0 #000, 0 -3px 0 #000',
          }}
        >
          {`《${bookName}》`}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 36,
              fontWeight: 400,
              color: 'rgba(255,255,255,0.8)',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
