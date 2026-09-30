import type { ComponentType } from 'react';
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Band, Chapter, Felt, Stage } from './components/base';
import { SubtitleText } from './components/Subtitles';
import { langFile } from './lang';
import { SCENES } from './scenes';
import { frames, timeline, useMarks } from './timeline';
import { BAND } from './theme';

function SceneShell({
  id,
  title,
  number,
  children,
}: {
  id: string;
  title: string;
  number?: number;
  children: React.ReactNode;
}) {
  const { length } = useMarks(id);
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, length - 9, length], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ opacity }}>
      <Stage>
        {children}
        {id !== 'intro' && id !== 'outro' && (
          <Chapter title={title} {...(number ? { number } : {})} />
        )}
      </Stage>
    </AbsoluteFill>
  );
}

const NUMBERED: Record<string, number> = { count: 1, color: 2 };

/** The whole tutorial: the felt, one sequence per scene, the band, the narration. */
export function Tutorial({ subtitles }: { subtitles: boolean }) {
  return (
    <AbsoluteFill>
      <Felt />
      {timeline.scenes.map((scene) => {
        const Scene: ComponentType = SCENES[scene.id] ?? (() => null);
        return (
          <Sequence
            key={scene.id}
            from={frames(scene.start)}
            durationInFrames={frames(scene.end - scene.start)}
            name={scene.title}
          >
            <SceneShell
              id={scene.id}
              title={scene.title}
              {...(NUMBERED[scene.id] ? { number: NUMBERED[scene.id] } : {})}
            >
              <Scene />
            </SceneShell>
          </Sequence>
        );
      })}
      <Band>{subtitles ? <SubtitleText /> : null}</Band>
      <Audio src={staticFile(langFile('audio/narration.wav'))} />
    </AbsoluteFill>
  );
}

/** Only the band with its subtitles, to lay over the clean video (ffmpeg overlay at the band). */
export function SubtitleBand() {
  return (
    <AbsoluteFill style={{ height: BAND }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Band top={0}>
          <SubtitleText />
        </Band>
      </div>
    </AbsoluteFill>
  );
}
