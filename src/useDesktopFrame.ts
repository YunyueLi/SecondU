import { useEffect, useState } from 'react';
import './native-chrome.css';

export function useDesktopFrame() {
  const bridge = window.hitherDesktop;
  const native = bridge?.platform === 'darwin';
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const state = bridge?.windowState;
    if (!native || !state) return;
    let active = true, received = false;
    const stop = state.onChange(next => { received = true; if (active) setFullscreen(next.fullscreen); });
    void state.get().then(next => { if (active && !received) setFullscreen(next.fullscreen); }).catch(() => {});
    return () => { active = false; stop(); };
  }, [native, bridge]);
  return { native, fullscreen };
}
