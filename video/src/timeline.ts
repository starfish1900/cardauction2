import frData from './fr/timeline.json';
import frSubtitles from './fr/subtitles.json';
import { LANG } from './lang';
import { FPS } from './theme';
import enData from './timeline.json';
import enSubtitles from './subtitles.json';

export interface Segment {
  readonly id: string | null;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** French segments: the English fragments the scenes look for, in this segment's words. */
  readonly anchors?: Readonly<Record<string, string>>;
}
export interface SceneTiming {
  readonly id: string;
  readonly title: string;
  readonly start: number;
  readonly end: number;
  readonly segments: readonly Segment[];
}

export const timeline = (LANG === 'fr' ? frData : enData) as {
  fps: number;
  duration: number;
  scenes: SceneTiming[];
};
export const cues = (LANG === 'fr' ? frSubtitles : enSubtitles) as {
  start: number;
  end: number;
  text: string;
}[];

export const frames = (seconds: number): number => Math.round(seconds * FPS);

export function sceneTiming(id: string): SceneTiming {
  const scene = timeline.scenes.find((s) => s.id === id);
  if (!scene) throw new Error(`no scene ${id} in the timeline`);
  return scene;
}

/**
 * Frames, counted from the scene's own start, at which a named segment of its narration starts
 * (or ends), plus an offset in seconds. Scenes use it to move things as the words are spoken.
 */
export function useMarks(sceneId: string) {
  const scene = sceneTiming(sceneId);
  const find = (id: string): Segment => {
    const segment = scene.segments.find((s) => s.id === id);
    if (!segment) throw new Error(`no segment ${id} in scene ${sceneId}`);
    return segment;
  };
  return {
    scene,
    length: frames(scene.end - scene.start),
    at: (id: string, offset = 0): number => frames(find(id).start - scene.start + offset),
    end: (id: string, offset = 0): number => frames(find(id).end - scene.start + offset),
    /**
     * About when a word of a segment is spoken: its share of the segment's characters. Close
     * enough to light something up as it is named.
     */
    word: (id: string, fragment: string, offset = 0): number => {
      const segment = find(id);
      const words = segment.anchors?.[fragment] ?? fragment;
      const index = segment.text.indexOf(words);
      if (index < 0) throw new Error(`"${words}" is not in segment ${id}`);
      const share = index / Math.max(1, segment.text.length);
      return frames(segment.start + (segment.end - segment.start) * share - scene.start + offset);
    },
  };
}
