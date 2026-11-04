import { useEffect, useRef, type ReactNode } from 'react';
import { hazardAt, type GameState } from './game';
import { SIZE } from './maze';

export function Icon({ name, size = 20 }: { name: 'play' | 'pause' | 'help' | 'data' | 'arrow' | 'download' | 'share' | 'close' | 'signal' | 'refresh'; size?: number }) {
  const paths = {
    play: <path d="m8 5 11 7-11 7z" />,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01" /></>,
    data: <><path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
    share: <><path d="M12 16V3m-5 5 5-5 5 5M5 12H3v9h18v-9h-2" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    signal: <><path d="M4 20v-4m5 4v-8m5 8V8m5 12V4" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">{paths[name]}</svg>;
}

export function HamsterPixels() {
  return <g shapeRendering="crispEdges">
    <path fill="#dca477" d="M3 1h4v3h3V1h4v5h1v7h-2v2H4v-2H2V6h1z" />
    <path fill="#f1bd9b" d="M4 2h2v3H4zm7 0h2v3h-2z" />
    <path fill="#f5dfbd" d="M5 8h7v1h1v4h-2v2H6v-2H4V9h1z" />
    <path fill="#14191c" d="M5 6h2v2H5zm6 0h2v2h-2zM8 10h2v1H8z" />
    <path fill="#f1bd9b" d="M3 9h2v2H3zm10 0h2v2h-2z" />
    <path fill="#eef2ef" d="M7 12h4v2H7z" />
    <path fill="#b87c58" d="M3 14h3v2H3zm8 0h3v2h-3z" />
  </g>;
}

export function HamsterMark({ size = 38 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true"><HamsterPixels /></svg>;
}

export function MazeBoard({ game, active, reduced }: { game: GameState; active: boolean; reduced: boolean }) {
  const cell = 30;
  const shield = game.shieldUntil > game.elapsed;
  return <svg className="maze" viewBox={`0 0 ${SIZE * cell} ${SIZE * cell}`} role="img" aria-label={`Maze. Hamster at column ${game.player.x}, row ${game.player.y}. ${game.remaining.size} Squeeks remaining. Four moving hazards.`}>
    <defs>
      <pattern id="floor" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="15" cy="15" r=".7" fill="#303c40" /></pattern>
      <pattern id="wall-lines" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6 6 0" stroke="#29363b" strokeWidth=".5" /></pattern>
    </defs>
    <rect width="630" height="630" fill="#131b1f" />
    <rect width="630" height="630" fill="url(#floor)" />
    <g fill="#29373d" stroke="#60747a" strokeWidth="1.2">
      {game.maze.cells.flatMap((row, y) => row.map((open, x) => open ? null : <rect key={`${x},${y}`} x={x * cell + 2} y={y * cell + 2} width="26" height="26" rx="2" />))}
    </g>
    <g fill="url(#wall-lines)" pointerEvents="none">
      {game.maze.cells.flatMap((row, y) => row.map((open, x) => open ? null : <rect key={`${x},${y}`} x={x * cell + 3} y={y * cell + 3} width="24" height="24" rx="2" />))}
    </g>
    <g fill="#f4d45c">
      {Array.from(game.remaining).map(point => { const [x, y] = point.split(',').map(Number); return <path key={point} d={`M${x*cell+15} ${y*cell+10}l5 5-5 5-5-5z`} />; })}
    </g>
    <g fill="none" stroke="#6bddda" strokeWidth="1.5"><rect x="34" y="34" width="22" height="22" rx="3" /></g>
    {game.maze.hazardPaths.map((path, i) => {
      const p = hazardAt(path, game.hazardStep);
      return <g key={i} className={active && !reduced ? 'hazard moving' : 'hazard'} style={{ transform: `translate(${p.x * cell + 15}px, ${p.y * cell + 15}px)` }}>
        <path d="M0-11 11 0 0 11-11 0z" fill="#ff928e" stroke="#ffb1a9" strokeWidth="1" />
        <path d="m-3-3 6 6m-6 0 6-6" stroke="#271c20" strokeWidth="2.5" />
      </g>;
    })}
    <g className={`player ${active && !reduced ? 'moving' : ''}`} style={{ transform: `translate(${game.player.x*cell+1}px, ${game.player.y*cell+1}px)` }}>
      {shield && <rect x="-2" y="-2" width="32" height="32" rx="6" fill="#163b3e" stroke="#6bddda" strokeWidth="2" />}
      <g transform="scale(1.7)"><HamsterPixels /></g>
    </g>
  </svg>;
}

export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const element = ref.current!;
    element.showModal();
    return () => { element.close(); prior?.focus(); };
  }, []);
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) close(); }} onKeyDown={e => {
    if (e.key !== 'Tab') return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea, input:not([disabled]), [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
    const first = items[0], last = items[items.length - 1];
    if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
  }}>
    <div className="modal-inner">
      <div className="modal-heading"><h2 id="modal-title">{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={close}><Icon name="close" /></button></div>
      {children}
    </div>
  </dialog>;
}
