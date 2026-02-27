import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import type { BookCardProps } from '../types';

export const BookCardVertical: React.FC<BookCardProps> = ({ imageSrc, backgroundSrc, bookName, subtitle }) => {
  return (
    <AbsoluteFill
      style={{
        background: backgroundSrc ? '#000' : 'radial-gradient(ellipse at 50% 30%, #1a1a2e 0%, #0a0a0f 100%)',
        fontFamily: 'Noto Sans SC, sans-serif',
      }}
    >
      {backgroundSrc && (
        <Img src={backgroundSrc} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} />
      )}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 60px',
          gap: 60,
        }}
      >
        {/* 上方：书名 */}
        <div style={{ position: 'absolute', top: 250, left: 0, right: 0, textAlign: 'center' }}>  
          <div
            style={{
              fontSize: 110,
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
                fontSize: 32,
                fontWeight: 400,
                color: 'rgba(255,255,255,0.8)',
                marginTop: 500,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {/* 下方：封面图 */}
        <div
          style={{
            position: 'absolute',
            bottom: 180,
            left: '50%',
            transform: 'translateX(-50%)',
            boxShadow: '20px 20px 60px rgba(0,0,0,0.8)',
            borderRadius: 8,
            overflow: 'hidden',
            marginBottom: 100,
          }}
        >
          <Img src={imageSrc} style={{ height: 700, objectFit: 'contain', display: 'block' }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
