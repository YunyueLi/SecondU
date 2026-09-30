import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { AgentBadgeStage } from './AgentIdentity';
import './scaled-agent-badge.css';

const BADGE_WIDTH = 238;
const BADGE_HEIGHT = BADGE_WIDTH * 4 / 3 + 54;

/** Scale the complete expert-preview badge, preserving every internal distance. */
export function ScaledAgentBadge(props: ComponentProps<typeof AgentBadgeStage>) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    setScale(wrapper.getBoundingClientRect().width / BADGE_WIDTH);
    const observer = new ResizeObserver(entries => {
      const entry = entries.find(item => item.target === wrapper);
      if (entry) setScale(entry.contentRect.width / BADGE_WIDTH);
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  return <div ref={wrapperRef} className="scaled-agent-badge" style={{height: BADGE_HEIGHT * scale}}>
    <div className="scaled-agent-badge-canvas" style={{transform: `scale(${scale})`}}>
      <AgentBadgeStage {...props}/>
    </div>
  </div>;
}
