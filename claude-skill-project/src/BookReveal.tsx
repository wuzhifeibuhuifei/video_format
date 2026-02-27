import {
  AbsoluteFill,
  Img,
  interpolate,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  Easing,
} from "remotion";

const IMAGE_ENTER_FRAME = 24;
const SLIDE_DURATION = 15;

const IMAGE_BASE_HEIGHT = 450;
const IMAGE_ASPECT = 1696 / 2528;
const IMAGE_BASE_WIDTH = IMAGE_BASE_HEIGHT * IMAGE_ASPECT;

export const BookReveal: React.FC = () => {
  const frame = useCurrentFrame();

  const slideEnd = IMAGE_ENTER_FRAME + SLIDE_DURATION;

  const translateX = interpolate(
    frame,
    [IMAGE_ENTER_FRAME, slideEnd],
    [490, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  // 固定在离底部100px的位置（相对于屏幕中心的偏移）
  const translateY = 120;

  const scale = interpolate(
    frame,
    [IMAGE_ENTER_FRAME, slideEnd],
    [0.6, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  const showImage = frame >= IMAGE_ENTER_FRAME;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo
        src={staticFile("background-video/flip-animation.mp4")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />

      {showImage && (
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Img
            src={staticFile("books/book-cover.png")}
            style={{
              width: IMAGE_BASE_WIDTH,
              height: IMAGE_BASE_HEIGHT,
              objectFit: "contain",
              transform: `translateX(${translateX}px) translateY(${translateY}px) scale(${scale})`,
            }}
          />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
