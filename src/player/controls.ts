// Late-bound playback controls. The YouTube engine fills these in once the
// iframe is ready; stores and UI call through without importing the engine.

export const controls = {
  play: () => {},
  pause: () => {},
  toggle: () => {},
  seek: (_seconds: number) => {},
  /** called just before the queue moves on, so the engine can log the listen */
  beforeChange: (_reason: 'skip' | 'end') => {},
};
