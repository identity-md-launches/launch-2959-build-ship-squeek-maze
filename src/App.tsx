import { useCallback, useEffect, useRef, useState } from 'react';
import { API_DOCS, API_ROOT, effectiveWheel, POLL_MS, SqueekApi, unavailableWheel, type BoardIdentity, type Snapshot, type WheelObservation } from './api';
import { advance, createGame, RUN_MS, type GameState } from './game';
import { generateMaze, type Direction } from './maze';
import { HamsterMark, Icon, MazeBoard, Modal } from './components';
import { bestFor, browserStorage, readBests, saveBest } from './storage';
import { downloadBlob, resultCard, resultText, type RunResult } from './share';

type Phase = 'boot' | 'ready' | 'starting' | 'playing' | 'paused' | 'result';
const keyDirections: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
const utcTime = (time: string | null | undefined) => time ? new Date(time).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour12: false }) + ' UTC' : 'No observation';
const number = (value: number) => String(value).padStart(4, '0');

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot');
  const phaseRef = useRef<Phase>('boot');
  const transition = useCallback((next: Phase) => { phaseRef.current = next; setPhase(next); }, []);
  const api = useRef(new SqueekApi());
  const busy = useRef(false);
  const [board, setBoard] = useState<BoardIdentity | null>(null);
  const boardRef = useRef<BoardIdentity | null>(null);
  const [wheel, setWheel] = useState<WheelObservation | null>(null);
  const wheelRef = useRef<WheelObservation | null>(null);
  const engine = useRef<GameState>(createGame(generateMaze('squeek-maze-sprint:connecting-preview')));
  const [game, setGame] = useState<GameState>(engine.current);
  const [bests, setBests] = useState(() => readBests(browserStorage()));
  const [result, setResult] = useState<RunResult | null>(null);
  const [storageMessage, setStorageMessage] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [manualCopy, setManualCopy] = useState(false);
  const [modal, setModal] = useState<'rules' | 'data' | null>(null);
  const [now, setNow] = useState(Date.now());
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const direction = useRef<Direction | null>(null);
  const sourceKey = useRef<string | null>(null);
  const arena = useRef<HTMLDivElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const hasLiveModifier = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  const applyWheel = useCallback((next: WheelObservation) => { wheelRef.current = next; setWheel(next); }, []);
  const applySnapshot = useCallback((snapshot: Snapshot) => {
    applyWheel(snapshot.wheel);
    boardRef.current = snapshot.board; setBoard(snapshot.board);
    const next = createGame(generateMaze(snapshot.board.seed));
    engine.current = next; setGame({ ...next });
  }, [applyWheel]);

  useEffect(() => {
    let canceled = false, timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    const poll = async () => {
      if (!busy.current) {
        busy.current = true;
        try {
          if (phaseRef.current === 'boot' || (phaseRef.current === 'ready' && polls % 3 === 0)) {
            const snapshot = await api.current.snapshot();
            if (!canceled && ['boot', 'ready'].includes(phaseRef.current)) { applySnapshot(snapshot); transition('ready'); }
          } else if (phaseRef.current !== 'starting') {
            try {
              const observation = await api.current.wheel();
              if (!canceled) applyWheel(observation);
            } catch (error) {
              if (!canceled) applyWheel(unavailableWheel(error instanceof Error ? error.message : 'The official API is unavailable.', Date.now(), wheelRef.current ?? undefined));
            }
          }
        } finally { busy.current = false; }
      }
      polls++;
      if (!canceled) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => { canceled = true; clearTimeout(timer); };
  }, [applySnapshot, applyWheel, transition]);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReduced(query.matches);
    query.addEventListener('change', changed);
    return () => { clearInterval(clock); query.removeEventListener('change', changed); };
  }, []);

  const pause = useCallback(() => {
    direction.current = null; sourceKey.current = null;
    if (phaseRef.current === 'playing') transition('paused');
  }, [transition]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))) return;
      const move = keyDirections[event.key] ?? keyDirections[event.key.toLowerCase()];
      if (move && phaseRef.current === 'playing') {
        event.preventDefault(); sourceKey.current = event.code; direction.current = move;
      }
      if ((event.key.toLowerCase() === 'p' || event.key === 'Escape') && !event.repeat) {
        if (phaseRef.current === 'playing') { event.preventDefault(); pause(); }
        else if (phaseRef.current === 'paused') { event.preventDefault(); transition('playing'); arena.current?.focus(); }
      }
    };
    const up = (event: KeyboardEvent) => { if (sourceKey.current === event.code) { direction.current = null; sourceKey.current = null; } };
    const hidden = () => { if (document.hidden) pause(); };
    const blur = () => { direction.current = null; sourceKey.current = null; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hidden); };
  }, [pause, transition]);

  useEffect(() => {
    if (phase !== 'playing') return;
    let frame: number, previous = performance.now(), renderAt = previous;
    const tick = (time: number) => {
      if (phaseRef.current !== 'playing') return;
      const activeBoard = boardRef.current!;
      const state = activeBoard.mode === 'live' ? effectiveWheel(wheelRef.current) : 'unknown';
      if (state !== 'unknown') hasLiveModifier.current = true;
      advance(engine.current, time - previous, direction.current, state);
      previous = time;
      if (time - renderAt >= 32 || engine.current.done) { setGame({ ...engine.current }); renderAt = time; }
      if (engine.current.done) {
        direction.current = null;
        const finished = engine.current;
        const report: RunResult = { board: activeBoard, score: finished.score, collected: finished.collected, hits: finished.hits, sweeps: finished.sweeps, modifiersObserved: hasLiveModifier.current };
        setResult(report);
        const saved = saveBest(browserStorage(), activeBoard, finished.score);
        setBests(saved.bests);
        setStorageMessage(saved.saved ? saved.isNew ? 'New best, saved on this device.' : 'Best score kept on this device.' : 'Storage unavailable. This score will not survive a reload.');
        transition('result');
      } else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, transition]);

  useEffect(() => { if (phase === 'result') resultHeading.current?.focus(); }, [phase]);

  const startRun = async () => {
    if (!['ready', 'result'].includes(phaseRef.current)) return;
    transition('starting'); setShareMessage(''); setManualCopy(false); setResult(null);
    direction.current = null;
    const snapshot = await api.current.snapshot();
    applySnapshot(snapshot); hasLiveModifier.current = false;
    const mustPause = document.hidden || !!document.querySelector('dialog[open]');
    transition(mustPause ? 'paused' : 'playing');
    if (!mustPause) requestAnimationFrame(() => arena.current?.focus());
  };

  const retry = async () => {
    if (refreshing || busy.current || phaseRef.current === 'starting') return;
    setRefreshing(true); busy.current = true;
    try {
      if (phaseRef.current === 'ready') {
        const snapshot = await api.current.snapshot();
        if (phaseRef.current === 'ready') applySnapshot(snapshot);
      }
      else {
        try { applyWheel(await api.current.wheel()); }
        catch (error) { applyWheel(unavailableWheel(error instanceof Error ? error.message : 'The API is unavailable.', Date.now(), wheelRef.current ?? undefined)); }
      }
    } finally { setRefreshing(false); busy.current = false; }
  };

  const openModal = (kind: 'rules' | 'data') => { pause(); setModal(kind); };
  const share = async () => {
    if (!result) return;
    const text = resultText(result);
    try {
      if (navigator.share) { await navigator.share({ title: 'Squeek Maze Sprint', text }); setShareMessage('Result shared.'); }
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text); setShareMessage('Result copied. Paste it into a message.'); }
      else setManualCopy(true);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setManualCopy(true); setShareMessage('Select and copy the result below.');
    }
  };
  const saveCard = async () => {
    if (!result) return;
    try { downloadBlob(await resultCard(result), `squeek-sprint-${result.board.round ?? 'demo'}-${result.score}.png`); setShareMessage('Result card downloaded.'); }
    catch (error) { setShareMessage(error instanceof Error ? error.message : 'Image export failed. Use Share result.'); }
  };

  const moveOnce = (next: Direction) => {
    if (phaseRef.current !== 'playing') return;
    advance(engine.current, 1, next, boardRef.current?.mode === 'live' ? effectiveWheel(wheelRef.current) : 'unknown');
    setGame({ ...engine.current });
  };
  const visibleWheel = effectiveWheel(wheel, now);
  const demo = board?.mode === 'demo';
  const modifier = demo ? 'unknown' : visibleWheel;
  const best = board ? bestFor(bests, board) : null;
  const remaining = Math.max(0, RUN_MS - game.elapsed);
  const active = phase === 'playing';
  const ready = phase === 'ready';
  const signalText = phase === 'boot' ? 'Connecting to Squeekchain' : demo ? 'Offline demo' : visibleWheel === 'unknown' ? 'Wheel signal unavailable' : `Live wheel · ${visibleWheel}`;

  return <div className="app">
    <a className="skip-link" href="#maze-game">Skip to game</a>
    <header className="app-header">
      <div className="brand"><HamsterMark /><div><h1>Squeek<span>Maze Sprint</span></h1></div></div>
      <div className="header-tools">
        <button type="button" className="text-button" onClick={() => openModal('rules')}><Icon name="help" /><span>Rules</span></button>
        <button type="button" className="text-button" onClick={() => openModal('data')}><Icon name="data" /><span>Source & data</span></button>
      </div>
    </header>

    <main className="game-shell" id="maze-game">
      <div className={`signal-strip ${demo ? 'demo' : ''}`}>
        <span className="signal-label"><span className={`signal-dot ${visibleWheel !== 'unknown' && !demo ? 'connected' : ''}`} aria-hidden="true" />{signalText}</span>
        <span className="signal-time">{wheel?.observedAt && !demo ? `Observed ${utcTime(wheel.observedAt)}` : 'Official public API'}</span>
      </div>

      <section className="play-zone" aria-label="60-second maze sprint">
        <div className="instrument-row">
          <div className="instrument score"><span>Score</span><strong data-testid="score">{number(game.score)}</strong></div>
          <div className={`instrument timer ${remaining <= 10000 ? 'low-time' : ''}`}><span>Time left</span><strong data-testid="timer">{(remaining / 1000).toFixed(1)}<small>s</small></strong></div>
          <div className="instrument best"><span>Round best</span><strong>{best ? number(best.score) : '----'}</strong></div>
          <button type="button" className="icon-button pause-button" aria-label={phase === 'paused' ? 'Resume sprint' : 'Pause sprint'} disabled={!['playing', 'paused'].includes(phase)} onClick={() => { if (phase === 'paused') { transition('playing'); arena.current?.focus(); } else pause(); }}><Icon name={phase === 'paused' ? 'play' : 'pause'} /></button>
        </div>

        <div ref={arena} className={`arena ${!active ? 'inactive' : ''}`} tabIndex={0} role="group" aria-label="Maze controls" aria-describedby="movement-help" data-testid="arena"
          onPointerDown={e => { if (e.pointerType === 'mouse' || !active) return; e.currentTarget.setPointerCapture(e.pointerId); gesture.current = { x: e.clientX, y: e.clientY }; }}
          onPointerMove={e => {
            if (!gesture.current || !active) return;
            const dx = e.clientX - gesture.current.x, dy = e.clientY - gesture.current.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
            direction.current = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up';
            moveOnce(direction.current);
            gesture.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={() => { gesture.current = null; direction.current = null; }} onPointerCancel={() => { gesture.current = null; direction.current = null; }}>
          <MazeBoard game={game} active={active} reduced={reduced} />
          {!active && <div className="arena-shade" aria-hidden="true" />}
          {(phase === 'boot' || phase === 'starting' || ready) && <section className="start-overlay" aria-labelledby="start-title">
            <HamsterMark size={56} />
            <h2 id="start-title">{phase === 'boot' ? 'Finding your maze' : phase === 'starting' ? 'Locking your maze' : 'Ready, little runner?'}</h2>
            <p>{phase === 'boot' || phase === 'starting' ? 'Reading the official Squeekchain API…' : 'Collect Squeeks. Dodge the red hazards.'}</p>
            <button type="button" className="primary-button" onClick={() => void startRun()} disabled={!ready}><Icon name="play" />{phase === 'boot' ? 'Connecting…' : phase === 'starting' ? 'Getting ready…' : demo ? 'Start demo' : 'Start sprint'}<span>60s</span></button>
            <p className={`overlay-note ${demo ? 'warning-text' : ''}`}>{ready ? demo ? 'Offline practice. No live data.' : `Round #${board?.round} · Same round, same maze` : 'The maze stays fixed for your run.'}</p>
          </section>}
          {phase === 'paused' && <section className="start-overlay" aria-labelledby="pause-title"><Icon name="pause" size={32} /><h2 id="pause-title">Take a breather.</h2><p>Your maze and timer are paused.</p><button type="button" className="primary-button" onClick={() => { transition('playing'); arena.current?.focus(); }}><Icon name="play" />Resume sprint</button><span className="overlay-note">Press P or Escape to resume.</span></section>}
          {phase === 'result' && result && <section className="result-overlay" aria-labelledby="result-title">
            <h2 id="result-title" ref={resultHeading} tabIndex={-1}>Sprint complete.</h2>
            <div className="result-number">{number(result.score)}<span>points</span></div>
            <p>{result.collected} Squeeks · {result.hits} bumps</p>
            <span className="result-round">{demo ? 'Offline demo result' : `Round #${result.board.round}`}</span>
            <button type="button" className="primary-button" onClick={() => void startRun()}><Icon name="play" />Play again<Icon name="arrow" /></button>
            <div className="share-actions"><button type="button" className="secondary-button" onClick={() => void share()}><Icon name="share" size={16} />Share result</button><button type="button" className="secondary-button" onClick={() => void saveCard()}><Icon name="download" size={16} />Save card</button></div>
            <p className="overlay-note">{storageMessage}</p>
            <p className="share-status" role="status">{shareMessage}</p>
          </section>}
        </div>

        <div className="board-caption"><div className="legend"><span><i className="squeek-symbol" />+10</span><span><i className="hazard-symbol">×</i>−25</span><span className="collected-label">{game.collected} collected</span></div><span className="board-round">{board ? demo ? 'Demo board' : `Round #${board.round}` : 'Syncing maze'}</span></div>
      </section>

      <aside className="control-panel" aria-label="Wheel signal and game information">
        <section className="wheel-section">
          <div className="panel-heading"><Icon name="signal" size={16} /><h2>The real wheel</h2><span className="public-label">Read only</span></div>
          <div className="wheel-state"><div className="wheel-illustration" aria-hidden="true"><svg viewBox="0 0 80 80"><circle cx="40" cy="36" r="29" /><circle cx="40" cy="36" r="24" /><path d="M40 7v58M11 36h58M20 16l40 40m0-40L20 56M32 65l-4 9m20-9 4 9M22 74h36" /><g transform="translate(28 32) scale(1.3)"><path d="M3 1h4v3h3V1h4v5h1v7h-2v2H4v-2H2V6h1z" fill="#dca477" stroke="none" /><path d="M5 8h7v6H5z" fill="#f5dfbd" stroke="none" /><path d="M5 6h2v2H5zm6 0h2v2h-2z" fill="#14191c" stroke="none" /></g></svg></div><div><strong>{phase === 'boot' ? 'Listening…' : demo ? 'Demo mode' : visibleWheel === 'running' ? 'Running' : visibleWheel === 'resting' ? 'Resting' : 'Signal lost'}</strong><span>{demo ? 'No live wheel data' : visibleWheel === 'unknown' ? 'Neutral game speeds' : `${wheel?.rpm?.toFixed(1)} rpm · hardware observation`}</span></div></div>
          <div className={`modifier ${modifier !== 'unknown' ? 'enabled' : ''}`}><span aria-hidden="true">{modifier === 'running' ? '↗' : modifier === 'resting' ? '↘' : '–'}</span><div><strong>{modifier === 'running' ? 'You move 10% faster' : modifier === 'resting' ? 'Hazards take 35% longer' : 'Standard movement speeds'}</strong><p>{modifier === 'running' ? 'A little lift from the live wheel.' : modifier === 'resting' ? 'A calmer maze while he rests.' : demo ? 'Offline practice uses a fixed board.' : 'Bonuses return with a fresh signal.'}</p></div></div>
          <p className="observation">{demo ? board?.reason : wheel?.reason ?? `Observed ${utcTime(wheel?.observedAt)}`}</p>
          <div className="source-line"><a href={`${API_ROOT}/status`} target="_blank" rel="noreferrer">Official source ↗</a><span>Refreshes every 5s</span></div>
          {(demo || visibleWheel === 'unknown') && phase !== 'boot' && <button type="button" className="secondary-button retry" disabled={refreshing} onClick={() => void retry()}><Icon name="refresh" size={16} />{refreshing ? 'Checking API…' : 'Retry live data'}</button>}
        </section>

        <section className="round-section"><h2>Your board</h2><dl><div><dt>{demo ? 'Mode' : 'API round'}</dt><dd>{demo ? 'Offline demo' : board?.round ? `#${board.round}` : 'Connecting…'}</dd></div><div><dt>Squeek height</dt><dd>{board?.height ? Number(board.height).toLocaleString('en') : 'Unavailable'}</dd></div><div><dt>Network</dt><dd>{board?.chain ?? 'Unavailable'}</dd></div></dl><button type="button" className="inline-button" onClick={() => openModal('data')}>View the maze seed <span aria-hidden="true">↗</span></button></section>

        <section className="desktop-controls"><h2>Make your move</h2><div className="keyboard-guide" aria-hidden="true"><kbd>W</kbd><div><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div></div><p>WASD or arrow keys to move.<br />P or Escape to pause.</p></section>

        <section className="local-section"><div className="panel-heading"><h2>Personal bests</h2><span className="public-label">This device</span></div>{bests.length ? <ol>{bests.slice(0, 3).map(b => <li key={b.seed}><span>{b.mode === 'demo' ? 'Offline demo' : `Round #${b.round}`}</span><strong>{number(b.score)}</strong></li>)}</ol> : <p>One good run starts a record.</p>}</section>
      </aside>

      <div className="touch-controls" aria-label="Touch movement controls"><div className="touch-help" id="movement-help"><strong>{modifier === 'running' ? 'Running: +10% speed' : modifier === 'resting' ? 'Resting: slower hazards' : demo ? 'Offline practice' : 'Hold to move'}</strong><p>Swipe and hold on the maze,<br />or hold an arrow to move.</p><span>Keyboard: arrows or WASD</span>{(demo || visibleWheel === 'unknown') && phase !== 'boot' && <button type="button" className="mobile-retry" disabled={refreshing} onClick={() => void retry()}><Icon name="refresh" size={14} />{refreshing ? 'Checking…' : 'Retry live data'}</button>}</div><div className="dpad">{(['up', 'left', 'down', 'right'] as Direction[]).map(d => <button type="button" className={`direction direction-${d}`} key={d} aria-label={`Move ${d}`} disabled={!active}
          onPointerDown={e => { if (!active) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); direction.current = d; moveOnce(d); }}
          onPointerUp={() => { direction.current = null; }} onPointerCancel={() => { direction.current = null; }} onLostPointerCapture={() => { direction.current = null; }}
          onClick={e => { if (e.detail === 0) moveOnce(d); }}><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 5-5 5 5" /></svg></button>)}</div></div>
    </main>

    <footer className="app-footer"><span><i aria-hidden="true" />Observe the wheel. Let him be.</span><a href="https://squeekchain.com/" target="_blank" rel="noreferrer">Squeekchain ↗</a><span className="footer-note">Game points only. No prizes or tokens.</span></footer>
    <div className="sr-only" role="status" aria-live="polite">{phase === 'playing' ? `${game.collected} Squeeks collected. ${game.hits} bumps. Score ${game.score}.` : phase === 'result' ? `Sprint complete. ${game.score} points.` : phase === 'paused' ? 'Sprint paused.' : ''}</div>
    {manualCopy && result && <Modal title="Copy your result" close={() => setManualCopy(false)}><p>Select the text below and copy it into a message.</p><textarea className="copy-result" aria-label="Result to copy" value={resultText(result)} readOnly onFocus={e => e.currentTarget.select()} /></Modal>}

    {modal === 'rules' && <Modal title="How to sprint" close={() => setModal(null)}><div className="rules-content"><p>Collect yellow Squeeks for <strong>60 seconds</strong>. Start in the cyan square.</p><ul><li><span className="rule-token"><i className="squeek-symbol" /></span><span><strong>Yellow Squeek: +10 points.</strong><br />Clear the board: +100 and a refill.</span></li><li><span className="rule-token"><i className="hazard-symbol">×</i></span><span><strong>Red hazard: −25 points.</strong><br />A bump grants a 1.8-second cyan shield. Scores stop at zero.</span></li><li><span className="rule-token"><Icon name="signal" /></span><span><strong>The wheel sets the pace.</strong><br />Running: +10% player speed. Resting: 35% longer hazard steps. Missing or stale signal: neutral speeds.</span></li></ul><p>Hold arrow keys or WASD. On touchscreens, use the direction pad or swipe and hold. P, Escape, or Pause freezes the timer. Switching tabs pauses too.</p><p>Each API round shares a fixed maze. Bests stay on this device; demos stay separate.</p><p className="welfare-callout">We only observe public data. Let the hamster set his own pace. Game points have no financial value.</p><button type="button" className="primary-button" onClick={() => setModal(null)}>Got it<Icon name="arrow" /></button></div></Modal>}

    {modal === 'data' && <Modal title="Source & data" close={() => setModal(null)}><div className="data-content"><p>An independent browser game using the <a href={API_DOCS} target="_blank" rel="noreferrer">official Squeekchain public API ↗</a>. No account, wallet, or transaction is involved.</p><h3>What we read</h3><ul className="endpoint-list"><li><a href={`${API_ROOT}/status`} target="_blank" rel="noreferrer">/v1/status ↗</a><span>Schema 1. Hardware wheel RPM, freshness, and the original observation time. Read every 5 seconds during play.</span></li><li><a href={`${API_ROOT}/core`} target="_blank" rel="noreferrer">/v1/core ↗</a><span>Schema 1. Settled Squeek height, round schedule, latest settlement hash, and settlement events.</span></li><li><a href={`${API_ROOT}/economy/state`} target="_blank" rel="noreferrer">/v1/economy/state ↗</a><span>Schema 2. Current round at the API’s safe Ethereum block. Chain reads lag the tip by 12 confirmations.</span></li></ul><h3>This maze</h3><dl className="provenance"><div><dt>Data mode</dt><dd>{board ? demo ? 'Offline demo; no chain identity' : 'Official API; round locked' : 'Connecting'}</dd></div><div><dt>Round / network</dt><dd>{board?.round ? `#${board.round} / ${board.chain}` : 'Unavailable in demo'}</dd></div><div><dt>Wheel observed</dt><dd>{wheel?.observedAt && !demo ? wheel.observedAt : 'Unavailable'}</dd></div><div><dt>Wheel provenance</dt><dd>{!demo ? wheel?.provenance ?? 'Unavailable' : 'No simulated telemetry'}</dd></div><div><dt>Latest settled height</dt><dd>{board?.height ?? 'Unavailable'}</dd></div><div><dt>Round anchor height</dt><dd>{board?.anchorHeight ?? 'Unavailable'}</dd></div><div><dt>Round starts</dt><dd>{board?.roundStart ?? 'Unavailable'}</dd></div><div><dt>Latest settlement hash at start</dt><dd className="hash-value">{board?.latestHash ?? 'Unavailable'}</dd></div><div><dt>Round-locked settlement hash</dt><dd className="hash-value">{board?.hash ?? 'Unavailable'}</dd></div><div><dt>Seed</dt><dd className="hash-value">{board?.seed ?? 'Waiting for API'}</dd></div></dl><p>The API does not publish a separate hash for every Squeek block. We use its Ethereum settlement hash: the latest BatchSettled event at or before the round begins. Later settlements cannot change the board. The latest hash read at run start is shown separately above.</p><p>Maze generation, Squeek positions, and hazard patrols use this seed. Live observations change speeds, so results are personal records, not a global leaderboard. Unavailable API data enables a labelled demo. A lost wheel signal during a live run keeps the maze and returns speeds to neutral.</p><a className="secondary-button download-source" href="./source.zip" download><Icon name="download" size={16} />Download complete source</a><p className="attribution">Original game code and pixel artwork, MIT licensed. Official data belongs to Squeekchain. See the included README for integration details and reproduction commands.</p></div></Modal>}
  </div>;
}
