import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BoardGrid } from '../components/BoardGrid';
import { Countdown, useSecondsLeft } from '../components/Countdown';
import { Scoreboard, money } from '../components/Scoreboard';
import * as E from '../lib/engine';
import { signedImageUrl } from '../lib/images';
import { hostUpdate, useRoom } from '../lib/room';
import { errorMessage, serverNow, supabase, syncClock } from '../lib/supabase';
import type { Board, RoomPrivate, RoomState, Team } from '../lib/types';
import { useWakeLock } from '../lib/wakeLock';

interface Loaded {
  code: string;
  board: Board;
  priv: RoomPrivate;
}

export function HostRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    syncClock();
    (async () => {
      const { data: room, error } = await supabase.from('rooms').select('code, game_id').eq('id', id).single();
      if (error || !room) return setLoadError('This game was not found, or it belongs to another host.');
      const [{ data: game }, { data: priv }] = await Promise.all([
        supabase.from('games').select('board').eq('id', room.game_id).single(),
        supabase.from('room_private').select('data').eq('room_id', id).single(),
      ]);
      if (!game) return setLoadError('The board for this game was deleted.');
      setLoaded({ code: room.code, board: game.board as Board, priv: (priv?.data as RoomPrivate) ?? { dailyDoubles: [] } });
    })();
  }, [id]);

  if (loadError) {
    return (
      <div className="page stack">
        <p className="error">{loadError}</p>
        <button onClick={() => navigate('/host')}>Back to your games</button>
      </div>
    );
  }
  if (!loaded || !id) return <div className="page muted">Loading…</div>;
  return <HostConsole roomId={id} {...loaded} />;
}

function HostConsole({ roomId, code, board, priv }: Loaded & { roomId: string }) {
  const navigate = useNavigate();
  const { snap } = useRoom(code);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTv, setShowTv] = useState(false);
  const undoStack = useRef<RoomState[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  useWakeLock(true);

  const run = useCallback(
    async (apply: (s: RoomState) => RoomState, opts: { undoable?: boolean } = {}) => {
      if (!snap) return;
      setBusy(true);
      setError(null);
      const before = snap.state;
      try {
        await hostUpdate(roomId, apply);
        if (opts.undoable) {
          undoStack.current = [...undoStack.current.slice(-19), before];
          setUndoCount(undoStack.current.length);
        }
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [roomId, snap],
  );

  const undo = () => {
    const prev = undoStack.current.pop();
    setUndoCount(undoStack.current.length);
    if (prev) run((s) => E.restore(s, prev));
  };

  // Once the Daily Double wager is in, put the clue on screen.
  const s = snap?.state;
  const ddFilling = useRef(false);
  useEffect(() => {
    if (s?.phase !== 'dd_clue' || s.current?.text || ddFilling.current) return;
    ddFilling.current = true;
    const { cat, row } = s.current!;
    signedImageUrl(board.categories[cat].clues[row].image)
      .then((url) => hostUpdate(roomId, (st) => (st.phase === 'dd_clue' && !st.current?.text ? E.showDailyDoubleClue(st, board, url) : st)))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => (ddFilling.current = false));
  }, [s, board, roomId]);

  if (!snap || !s) return <div className="page muted">Connecting…</div>;

  const teamName = (tid: string | null | undefined) => s.teams.find((t) => t.id === tid)?.name ?? '';
  const adjust = (t: Team) => {
    const v = prompt(`New score for ${t.name}`, String(t.score));
    if (v !== null && v.trim() !== '' && !Number.isNaN(Number(v))) run((st) => E.setScore(st, t.id, Math.round(Number(v))), { undoable: true });
  };

  return (
    <div className="page stack">
      <div className="row spread">
        <div className="row">
          <button className="link" onClick={() => navigate('/host')}>← Your games</button>
          <span className="brand">{s.title}</span>
        </div>
        <div className="row">
          <span>Room <span className="code" style={{ fontSize: '1.4rem' }}>{code}</span></span>
          <button onClick={() => setShowTv(true)}>Show on TV</button>
          <button onClick={() => window.open(`/tv/${code}`, '_blank')}>Open TV view here</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="host-grid">
        <div className="card stack">
          <PhasePanel s={s} board={board} priv={priv} busy={busy} run={run} teamName={teamName} roomId={roomId} />
        </div>
        <div className="stack">
          <div className="card stack">
            <div className="row spread">
              <h3 style={{ margin: 0 }}>Scores</h3>
              <button disabled={!undoCount || busy} onClick={undo}>Undo</button>
            </div>
            {s.teams.length ? <Scoreboard teams={s.teams} control={s.control} onTeamClick={adjust} /> : <p className="muted">No teams yet.</p>}
            <p className="muted small">Tap a score to change it. The gold outline marks the team that picks next.</p>
            {s.teams.length > 0 && s.phase !== 'lobby' && (
              <div>
                <label htmlFor="control">Picking next</label>
                <select id="control" value={s.control ?? ''} onChange={(e) => run((st) => E.setControl(st, e.target.value))}>
                  <option value="" disabled>Choose a team</option>
                  {s.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {s.phase !== 'lobby' && (
            <div className="card">
              <BoardGrid state={s} className="host-board" dailyDoubles={priv.dailyDoubles} />
            </div>
          )}
        </div>
      </div>

      {showTv && (
        <div className="modal-back" onClick={() => setShowTv(false)}>
          <div className="modal card stack" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <h3>Show the board on a TV</h3>
            <p>On the TV's web browser, go to</p>
            <p className="code" style={{ fontSize: '1.6rem', letterSpacing: '0.04em' }}>{window.location.host}/tv</p>
            <p>and enter the code</p>
            <p className="code big-code" style={{ fontSize: '4rem' }}>{code}</p>
            <p className="muted small">Using a laptop with HDMI, Chromecast or AirPlay instead? Choose “Open TV view here” and press F11 for full screen.</p>
            <button onClick={() => setShowTv(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

interface PanelProps {
  s: RoomState;
  board: Board;
  priv: RoomPrivate;
  busy: boolean;
  roomId: string;
  run: (apply: (s: RoomState) => RoomState, opts?: { undoable?: boolean }) => Promise<void>;
  teamName: (id: string | null | undefined) => string;
}

function AnswerBox({ response }: { response: string }) {
  return (
    <div className="answer-box">
      <div className="muted small">Correct response (only you can see this)</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{response}</div>
    </div>
  );
}

function PhasePanel({ s, board, priv, busy, run, teamName, roomId }: PanelProps) {
  const cur = s.current;
  const clue = cur ? board.categories[cur.cat].clues[cur.row] : null;
  const catName = cur ? s.categories[cur.cat].name : '';

  switch (s.phase) {
    case 'lobby': {
      return (
        <>
          <h2>Waiting for teams</h2>
          <p className="muted">Teams scan the QR code on the TV, or go to <b>{window.location.host}</b> and enter the room code. Up to 6 teams.</p>
          {s.teams.length ? (
            <div className="row">
              {s.teams.map((t) => (
                <span key={t.id} className="team-chip"><span className="dot" style={{ background: t.color }} />{t.name}</span>
              ))}
            </div>
          ) : (
            <p className="muted">No teams have joined yet.</p>
          )}
          <div>
            <label htmlFor="first">Who picks first?</label>
            <select id="first" value={s.control ?? ''} onChange={(e) => run((st) => E.setControl(st, e.target.value))}>
              <option value="">Choose a team</option>
              {s.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <button
            className="primary big"
            disabled={busy || !s.teams.length}
            onClick={() => run((st) => ({ ...st, phase: 'board', control: st.control ?? st.teams[0]?.id ?? null }))}
          >
            Start the game
          </button>
        </>
      );
    }
    case 'board':
      return (
        <>
          <h2>{s.control ? `${teamName(s.control)} picks` : 'Pick a clue'}</h2>
          <p className="muted">Tap the clue they choose. “DD” marks a Daily Double, which only you can see.</p>
          <div style={{ height: 320 }}>
            <BoardGrid
              state={s}
              className="host-board"
              dailyDoubles={priv.dailyDoubles}
              onPick={async (cat, row) => {
                const url = await signedImageUrl(board.categories[cat].clues[row].image);
                run((st) => (st.phase === 'board' ? E.pickClue(st, board, priv, cat, row, url) : st), { undoable: true });
              }}
            />
          </div>
          <button className={E.boardDone(s) ? 'primary big' : ''} disabled={busy} onClick={() => (E.boardDone(s) || confirm('Some clues are still on the board. Go to Final Jeopardy anyway?')) && run((st) => E.startFinal(st, board), { undoable: true })}>
            Go to Final Jeopardy
          </button>
        </>
      );
    case 'clue': {
      const b = cur!.buzz;
      return (
        <>
          <div className="muted">{catName} · {money(cur!.value)}</div>
          <h2 style={{ fontFamily: 'var(--font-clue)' }}>{clue?.text}</h2>
          <AnswerBox response={clue?.response ?? ''} />
          {b.winner ? (
            <>
              <h3>{teamName(b.winner)} buzzed in</h3>
              <div className="row">
                <button className="good big" disabled={busy} onClick={() => run((st) => E.judge(st, board, true), { undoable: true })}>✓ Correct</button>
                <button className="bad big" disabled={busy} onClick={() => run((st) => E.judge(st, board, false), { undoable: true })}>✗ Incorrect</button>
              </div>
            </>
          ) : b.open ? (
            <h3 className="muted">Buzzers open, waiting for a buzz…</h3>
          ) : (
            <button className="primary big" disabled={busy} onClick={() => run(E.openBuzzers)}>Open buzzers</button>
          )}
          {b.lockedOut.length > 0 && <p className="muted small">Locked out: {b.lockedOut.map(teamName).join(', ')}</p>}
          <button disabled={busy} onClick={() => run((st) => E.endClue(st, board), { undoable: true })}>Nobody got it: show the answer</button>
        </>
      );
    }
    case 'dd_wager':
      return <DailyDoublePanel s={s} busy={busy} run={run} teamName={teamName} roomId={roomId} />;
    case 'dd_clue':
      return (
        <>
          <div className="muted">Daily Double · {catName} · {teamName(s.control)} bet {money(cur!.ddWager ?? 0)}</div>
          <h2 style={{ fontFamily: 'var(--font-clue)' }}>{clue?.text}</h2>
          <AnswerBox response={clue?.response ?? ''} />
          <div className="row">
            <button className="good big" disabled={busy || !cur?.text} onClick={() => run((st) => E.judge(st, board, true), { undoable: true })}>✓ Correct</button>
            <button className="bad big" disabled={busy || !cur?.text} onClick={() => run((st) => E.judge(st, board, false), { undoable: true })}>✗ Incorrect</button>
          </div>
        </>
      );
    case 'reveal':
      return (
        <>
          <div className="muted">{catName}</div>
          <h2>{cur?.outcome === 'correct' ? `${teamName(s.control)} got it` : 'Nobody got it'}</h2>
          <AnswerBox response={cur?.response ?? ''} />
          <button className="primary big" disabled={busy} onClick={() => run(E.backToBoard, { undoable: true })}>Back to the board</button>
        </>
      );
    case 'final_wager':
      return (
        <>
          <h2>Final Jeopardy: {s.final?.category}</h2>
          <p>Teams are placing secret wagers on their phones. Teams at $0 or below play for bragging rights.</p>
          <p className="muted">{s.final?.locked.length ?? 0} of {s.teams.length} wagers locked in. Missing wagers count as $0.</p>
          <button
            className="primary big"
            disabled={busy}
            onClick={async () => {
              const url = await signedImageUrl(board.final.image);
              run((st) => E.revealFinalClue(st, board, url, serverNow()));
            }}
          >
            Reveal the final clue
          </button>
        </>
      );
    case 'final_answer':
      return <FinalAnswerPanel s={s} board={board} busy={busy} run={run} />;
    case 'final_reveal':
      return <FinalRevealPanel s={s} board={board} busy={busy} run={run} teamName={teamName} roomId={roomId} />;
    case 'podium':
      return (
        <>
          <h2>Game over</h2>
          <p>The TV is showing the final standings.</p>
        </>
      );
  }
}

function DailyDoublePanel({ s, busy, run, teamName }: Omit<PanelProps, 'board' | 'priv'>) {
  const [amount, setAmount] = useState('');
  return (
    <>
      <h2>Daily Double!</h2>
      <p>{teamName(s.control)} is placing a bet on their phone.</p>
      <p className="muted small">Phone trouble? Enter their bet here instead.</p>
      <div className="row">
        <input type="number" inputMode="numeric" min={5} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ maxWidth: 160 }} placeholder="500" />
        <button
          disabled={busy || !(Number(amount) >= 5)}
          onClick={() =>
            run((st) => (st.phase === 'dd_wager' && st.current ? { ...st, phase: 'dd_clue', current: { ...st.current, ddWager: Math.round(Number(amount)) } } : st))
          }
        >
          Use this bet
        </button>
      </div>
    </>
  );
}

function FinalAnswerPanel({ s, board, busy, run }: Omit<PanelProps, 'priv' | 'teamName' | 'roomId'>) {
  const left = useSecondsLeft(s.final?.endsAt);
  return (
    <>
      <h2 style={{ fontFamily: 'var(--font-clue)' }}>{board.final.text}</h2>
      <AnswerBox response={board.final.response} />
      <Countdown endsAt={s.final?.endsAt} />
      <p className="muted">{s.final?.answered.length ?? 0} of {s.teams.length} responses in.</p>
      <div className="row">
        <button disabled={busy} onClick={() => run((st) => E.addFinalTime(st, 10))}>+10 seconds</button>
        <button
          className={left === 0 ? 'primary big' : ''}
          disabled={busy}
          onClick={() => (left === 0 || confirm('Time is still running. Start the reveal now?')) && run(E.startFinalReveal)}
        >
          Start the reveal
        </button>
      </div>
    </>
  );
}

function FinalRevealPanel({ s, board, busy, run, teamName, roomId }: Omit<PanelProps, 'priv'>) {
  const [subs, setSubs] = useState<Record<string, { wager: number; response: string }>>({});
  const f = s.final!;
  const teamId = f.order[f.index];

  useEffect(() => {
    supabase.from('room_submissions').select('team_id, kind, value').eq('room_id', roomId).then(({ data }) => {
      const out: Record<string, { wager: number; response: string }> = {};
      for (const row of data ?? []) {
        out[row.team_id] ??= { wager: 0, response: '' };
        if (row.kind === 'final_wager') out[row.team_id].wager = Number(row.value) || 0;
        else out[row.team_id].response = row.value;
      }
      setSubs(out);
    });
  }, [roomId, f.index]);

  if (!teamId) {
    return (
      <>
        <h2>All responses revealed</h2>
        <AnswerBox response={board.final.response} />
        <button className="primary big" disabled={busy} onClick={() => run(E.showPodium)}>Show final standings</button>
      </>
    );
  }
  const team = s.teams.find((t) => t.id === teamId);
  // A team at $0 or below always plays for $0.
  const wager = team && team.score > 0 ? Math.min(subs[teamId]?.wager ?? 0, team.score) : 0;
  const response = subs[teamId]?.response ?? '';
  return (
    <>
      <div className="muted">Revealing {f.index + 1} of {f.order.length}, lowest score first</div>
      <h2>{teamName(teamId)}</h2>
      <div className="card">
        <div className="muted small">Their response</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{response || '(no response)'}</div>
        <div className="muted small" style={{ marginTop: 8 }}>Wager: {money(wager)}</div>
      </div>
      <AnswerBox response={board.final.response} />
      <div className="row">
        <button className="good big" disabled={busy} onClick={() => run((st) => E.judgeFinal(st, board, response, wager, true), { undoable: true })}>✓ Correct</button>
        <button className="bad big" disabled={busy} onClick={() => run((st) => E.judgeFinal(st, board, response, wager, false), { undoable: true })}>✗ Incorrect</button>
      </div>
    </>
  );
}
