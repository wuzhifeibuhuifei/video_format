import { Player } from '@remotion/player';
import { VideoComposition } from './remotion/VideoComposition';

type Props = {
  props: any;
};

export function VideoPreview({ props }: Props) {
  const totalDuration = calculateDuration(props);

  return (
    <div className="bg-black rounded overflow-hidden">
      <Player
        component={VideoComposition}
        inputProps={props}
        durationInFrames={totalDuration}
        fps={props.fps}
        compositionWidth={props.width}
        compositionHeight={props.height}
        style={{ width: '100%' }}
        controls
      />
    </div>
  );
}

function calculateDuration(props: any): number {
  const shotsDuration = props.shots.reduce(
    (sum: number, s: any) => sum + s.durationInFrames,
    0
  );
  const transitionFrames = Math.round(props.transitionDuration * props.fps);
  const count = Math.max(0, props.shots.length - 1);
  return shotsDuration - count * transitionFrames;
}
