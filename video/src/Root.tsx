import './fonts';
import './global.css';
import { Composition } from 'remotion';
import { SubtitleBand, Tutorial } from './Tutorial';
import { frames, timeline } from './timeline';
import { BAND, FPS, H, W } from './theme';

export function Root() {
  const duration = frames(timeline.duration);
  return (
    <>
      <Composition
        id="Tutorial"
        component={Tutorial}
        durationInFrames={duration}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{ subtitles: false }}
      />
      <Composition
        id="TutorialSubtitled"
        component={Tutorial}
        durationInFrames={duration}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{ subtitles: true }}
      />
      <Composition
        id="SubtitleBand"
        component={SubtitleBand}
        durationInFrames={duration}
        fps={FPS}
        width={W}
        height={BAND}
      />
    </>
  );
}
