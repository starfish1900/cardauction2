import type { ComponentType } from 'react';
import { Action } from './Action';
import { App } from './App';
import { Cards } from './Cards';
import { Color } from './Color';
import { Count } from './Count';
import { End } from './End';
import { First } from './First';
import { Flow } from './Flow';
import { Goal } from './Goal';
import { Intro } from './Intro';
import { Outro } from './Outro';
import { Rollover } from './Rollover';
import { Setup } from './Setup';
import { Take } from './Take';

/** Each scene of the tutorial, by its id in the script. */
export const SCENES: Record<string, ComponentType> = {
  intro: Intro,
  goal: Goal,
  cards: Cards,
  setup: Setup,
  flow: Flow,
  count: Count,
  rollover: Rollover,
  color: Color,
  action: Action,
  take: Take,
  first: First,
  end: End,
  app: App,
  outro: Outro,
};
