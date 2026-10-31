import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BoardGrid } from '../components/BoardGrid';
import { CodeForm } from '../components/CodeForm';
import { Countdown } from '../components/Countdown';
import { QrCode } from '../components/QrCode';
import { Scoreboard, money } from '../components/Scoreboard';
import { useRoom } from '../lib/room';
import { syncClock } from '../lib/supabase';
import type { RoomState, Team } from '../lib/types';

export function TvPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { snap, missing } = useRoom(code ?? null);

  useEffect(() => {
    syncClock();
  }, []);

  if (!code || missing) {
    return (
      <div className="page narrow stack" style={{ paddingTop: 48 }}>
        <h1 className="brand" style={{ textAlign: 'center' }}>TV view</h1>
        <div className="card">
          <CodeForm
            label="Enter the room code shown on the host's screen"
            button="Show the board"
            error={missing ? `No game found with code ${code}.` : null}
            onSubmit={(c) => navigate(`/tv/${c}`)}
          />
        </div>
      </div>
    );
  }
  if (!snap) return <div className="page muted">Connecting…</div>;

  const s = snap.state;
  return (
    <div className="tv">
      <div className="tv-main">
        <TvMain s={s} code={code} />
      </div>
      {s.phase !== 'lobby' && s.phase !== 'podium' && <Scoreboard teams={s.teams} control={s.control} />}
    </div>
  );
}

const teamById = (s: RoomState, id: string | null | undefined): Team | undefined => s.teams.find((t) => t.id === id);

function Banner({ team, text }: { team?: Team; text: string }) {
  return <div className="buzz-banner" style={{ background: team?.color ?? '#333' }}>{text}</div>;
}

function TvMain({ s, code }: { s: RoomState; code: string }) {
  const cur = s.current;
  const catName = cur ? s.categories[cur.cat]?.name : '';
  switch (s.phase) {
    case 'lobby': {
      const joinUrl = `${window.location.origin}/join/${code}`;
      return (
        <div className="lobby">
          <QrCode value={joinUrl} />
          <div className="stack">
            <div className="brand" style={{ fontSize: 'clamp(1.5rem, 4vw, 4rem)' }}>{s.title}</div>
            <div style={{ fontSize: 'clamp(1rem, 2vw, 2rem)' }}>Scan to join, or go to <b>{window.location.host}</b> and enter</div>
            <div className="code big-code">{code}</div>
            <div className="row" style={{ gap: 16 }}>
              {s.teams.map((t) => (
                <span key={t.id} className="buzz-banner" style={{ background: t.color, fontSize: 'clamp(1rem, 2vw, 2rem)' }}>{t.name}</span>
              ))}
              {!s.teams.length && <span className="muted" style={{ fontSize: '1.5rem' }}>Waiting for teams…</span>}
            </div>
          </div>
        </div>
      );
    }
    case 'board':
      return <BoardGrid state={s} />;
    case 'clue':
    case 'dd_clue': {
      const dd = s.phase === 'dd_clue';
      const winner = dd ? teamById(s, s.control) : teamById(s, cur?.buzz.winner);
      return (
        <div className="clue-screen">
          <div className="clue-meta">{catName} · {dd ? `Daily Double · wager ${money(cur?.ddWager ?? 0)}` : money(cur?.value ?? 0)}</div>
          {cur?.imageUrl && <img className="clue-image" src={cur.imageUrl} alt="" />}
          <div className={`clue-text${cur?.imageUrl ? ' with-image' : ''}`}>{cur?.text ?? '…'}</div>
          {winner ? <Banner team={winner} text={winner.name} /> : cur?.buzz.open && <div className="clue-meta">Buzzers open!</div>}
        </div>
      );
    }
    case 'dd_wager':
      return (
        <div className="clue-screen">
          <div className="dd-title">Daily Double</div>
          <Banner team={teamById(s, s.control)} text={`${teamById(s, s.control)?.name ?? ''} is placing a bet`} />
        </div>
      );
    case 'reveal': {
      const who = cur?.outcome === 'correct' ? teamById(s, s.control) : undefined;
      const won = cur?.isDD ? cur.ddWager ?? 0 : cur?.value ?? 0;
      return (
        <div className="clue-screen">
          <div className="clue-meta">{catName}</div>
          <div className="clue-text with-image">{cur?.text}</div>
          <div className="response-text">{cur?.response}</div>
          {who && <Banner team={who} text={`${who.name} +${money(won)}`} />}
        </div>
      );
    }
    case 'final_wager':
      return (
        <div className="clue-screen">
          <div className="dd-title" style={{ fontSize: 'clamp(2.5rem, 7vw, 8rem)' }}>Final Jeopardy</div>
          <div className="clue-text">{s.final?.category}</div>
          <div className="clue-meta">
            Place your wagers · {s.final?.locked.length ?? 0} of {s.teams.length} teams locked in
          </div>
        </div>
      );
    case 'final_answer':
      return (
        <div className="clue-screen">
          <div className="clue-meta">Final Jeopardy · {s.final?.category}</div>
          {s.final?.imageUrl && <img className="clue-image" src={s.final.imageUrl} alt="" />}
          <div className={`clue-text${s.final?.imageUrl ? ' with-image' : ''}`}>{s.final?.text}</div>
          <Countdown endsAt={s.final?.endsAt} />
          <div className="clue-meta">{s.final?.answered.length ?? 0} of {s.teams.length} responses in</div>
        </div>
      );
    case 'final_reveal': {
      const f = s.final!;
      const last = f.shown[f.shown.length - 1];
      const team = teamById(s, last?.teamId);
      return (
        <div className="clue-screen">
          <div className="clue-meta">Final Jeopardy · {f.category}</div>
          <div className="clue-text with-image">{f.text}</div>
          {last && team ? (
            <div className="stack" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Banner team={team} text={team.name} />
              <div className="response-text" style={{ color: last.correct ? 'var(--ok)' : 'var(--danger)' }}>
                {last.response || '(no response)'}
              </div>
              <div className="clue-meta">
                {last.correct ? 'Correct' : 'Incorrect'} · wagered {money(last.wager)}
              </div>
            </div>
          ) : (
            <div className="clue-meta">Revealing responses…</div>
          )}
          {f.response && <div className="response-text">Correct response: {f.response}</div>}
        </div>
      );
    }
    case 'podium': {
      const ranked = [...s.teams].sort((a, b) => b.score - a.score);
      const [winner, ...rest] = ranked;
      return (
        <div className="clue-screen">
          <div className="clue-meta">Winner</div>
          {winner && <div className="dd-title" style={{ color: winner.color }}>{winner.name}</div>}
          {winner && <div className="countdown">{money(winner.score)}</div>}
          <div className="scores">
            {rest.map((t, i) => (
              <div key={t.id} className="score" style={{ borderColor: t.color }}>
                <div className="name" style={{ color: t.color }}>{i + 2}. {t.name}</div>
                <div className="pts">{money(t.score)}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
  }
}
