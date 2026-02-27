import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";
import { BookReveal } from "./BookReveal";
import { TOTAL_DURATION_SEC } from "./shots";

const FPS = 30;
const TOTAL_FRAMES = TOTAL_DURATION_SEC * FPS;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MainVideo"
        component={MainVideo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id="BookReveal"
        component={BookReveal}
        durationInFrames={64}
        fps={FPS}
        width={1280}
        height={720}
      />
    </>
  );
};
