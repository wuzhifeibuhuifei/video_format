import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { TikTokPage } from "@remotion/captions";
import { interpolate } from "remotion";

const HIGHLIGHT_COLOR = "#FFD700";
const TEXT_COLOR = "#FFFFFF";
const SHADOW_COLOR = "rgba(0, 0, 0, 0.8)";

type CaptionPageProps = {
  readonly page: TikTokPage;
};

export const CaptionPage: React.FC<CaptionPageProps> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentTimeMs = (frame / fps) * 1000;
  const absoluteTimeMs = page.startMs + currentTimeMs;

  const enterOpacity = interpolate(frame, [0, 0.3 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });

  const scale = interpolate(frame, [0, 0.2 * fps], [0.9, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 120,
      }}
    >
      <div
        style={{
          fontSize: 52,
          fontWeight: "bold",
          whiteSpace: "pre-wrap",
          textAlign: "center",
          opacity: enterOpacity,
          transform: `scale(${scale})`,
          textShadow: `2px 2px 8px ${SHADOW_COLOR}, 0 0 20px ${SHADOW_COLOR}`,
          maxWidth: "85%",
          lineHeight: 1.4,
        }}
      >
        {page.tokens.map((token) => {
          const isActive =
            token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;

          const tokenScale = isActive ? 1.15 : 1;

          return (
            <span
              key={token.fromMs}
              style={{
                color: isActive ? HIGHLIGHT_COLOR : TEXT_COLOR,
                display: "inline-block",
                transform: `scale(${tokenScale})`,
                transition: "none",
              }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
