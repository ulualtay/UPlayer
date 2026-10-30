import { useEffect, useState } from 'react';
import { cachedColor, extractColor } from './color';

/** Dominant colour of a cover image (hex), or undefined while loading. */
export function useCoverColor(url: string | undefined): string | undefined {
  const [color, setColor] = useState(() => cachedColor(url));
  useEffect(() => {
    let alive = true;
    setColor(cachedColor(url));
    if (url) {
      void extractColor(url).then((c) => {
        if (alive && c) setColor(c);
      });
    }
    return () => {
      alive = false;
    };
  }, [url]);
  return color;
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}
