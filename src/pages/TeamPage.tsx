import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CodeForm } from '../components/CodeForm';
import { useSecondsLeft } from '../components/Countdown';
import { money } from '../components/Scoreboard';
import { useRoom } from '../lib/room';
import { errorMessage, supabase, syncClock } from '../lib/supabase';
import type { RoomState, Team } from '../lib/types';
import { useWakeLock } from '../lib/wakeLock';

interface Membership {
  teamId: string;
  token: string;
}

const storageKey = (code: string) => `jparty-team-${code}`;
const loadMembership = (code: string): Membership | null => {
  try {
    return JSON.parse(localStorage.getItem(storageKey(code)) ?? 'null');
  } catch {
    return null;
  }
};

export function TeamPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { snap, missing } = useRoom(code ?? null);
  const [me, setMe] = useState<Membership | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    syncClock();
  }, []);

  // Rejoin with the token saved on this phone, if it is still valid.
  useEffect(() => {
    if (!code) return;
    setChecked(false);
    const saved = loadMembership(code);
    if (!saved) {
      setMe(null);
      setChecked(true);
      return;
    }
    supabase.rpc('rejoin_room', { p_code: code, p_token: saved.token }).then(({ data }) => {
      if (data) setMe(saved);
      else localStorage.removeItem(storageKey(code));
      setChecked(true);
    });
  }, [code]);

  useWakeLock(!!me);

  if (!code || missing) {
    return (
      <div className="page narrow stack" style={{ paddingTop: 48 }}>
        <h1 className="brand" style={{ textAlign: 'center' }}>Join a game</h1>
        <div className="card">
          <CodeForm
            label="Room code from the TV"
            button="Join"
            error={missing ? `No game found with code ${code}.` : null}
            onSubmit={(c) => navigate(`/join/${c}`)}
          />
        </div>
      </div>
    );
  }
  if (!snap || !checked) return <div className="page muted">Connecting…</div>;
  const team = me && snap.state.teams.find((t) => t.id === me.teamId);
  if (!me || !team) {
    return (
      <JoinForm
        code={code}
        state={snap.state}
        onJoined={(m) => {
          localStorage.setItem(storageKey(code), JSON.stringify(m));
          setMe(m);
        }}
      />
    );
  }
  return <Buzzer code={code} state={snap.state} me={me} team={team} />;
}

function JoinForm({ code, state, onJoined }: { code: string; state: RoomState; onJoined: (m: Membership) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const full = state.teams.length >= 6;
  return (
    <div className="page narrow stack" style={{ paddingTop: 48 }}>
      <p className="muted" style={{ textAlign: 'center' }}>Joining <b>{state.title}</b> · room <span className="code">{code}</span></p>
      <form
        className="card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return setError('Enter a team name');
          setBusy(true);
          setError(null);
          const { data, error } = await supabase.rpc('join_room', { p_code: code, p_name: name });
          setBusy(false);
          if (error) return setError(errorMessage(error));
          onJoined(data as Membership);
        }}
      >
        <label htmlFor="team">Team name</label>
        <input id="team" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="The Know-It-Alls" autoFocus />
        {full && <p className="error small">This game already has 6 teams.</p>}
        {error && <p className="error small">{error}</p>}
        <button className="primary big" disabled={busy || full} type="submit">Join</button>
      </form>
    </div>
  );
}

function Buzzer({ code, state: s, me, team }: { code: string; state: RoomState; me: Membership; team: Team }) {
  const [early, setEarly] = useState(false);
  const cur = s.current;
  const won = s.phase === 'clue' && cur?.buzz.winner === team.id;

  // Buzz-win feedback: vibrate where the phone allows it (not iPhone).
  const wonBefore = useRef(false);
  useEffect(() => {
    if (won && !wonBefore.current) navigator.vibrate?.([120, 60, 120]);
    wonBefore.current = won;
  }, [won]);

  const buzz = async () => {
    const { data } = await supabase.rpc('buzz', { p_code: code, p_token: me.token });
    if (data === 'early') {
      setEarly(true);
      setTimeout(() => setEarly(false), 400);
    }
  };

  const top = (
    <div className="phone-top" style={{ borderBottom: `4px solid ${team.color}` }}>
      <span style={{ color: team.color }}>{team.name}</span>
      <span>{money(team.score)}</span>
    </div>
  );
  const screen = (cls: string, headline: string, sub?: string, style?: React.CSSProperties) => (
    <div className={`phone-body ${cls}`} style={style}>
      <div className="headline">{headline}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
  const controller = s.teams.find((t) => t.id === s.control);

  let body: React.ReactNode;
  switch (s.phase) {
    case 'lobby':
      body = screen('state-wait', "You're in!", 'Waiting for the host to start');
      break;
    case 'board':
      body = s.control === team.id
        ? screen('state-wait', 'Your pick!', 'Tell the host a category and value', { boxShadow: `inset 0 0 0 8px ${team.color}` })
        : screen('state-wait', 'Watch the board', controller ? `${controller.name} is picking` : undefined);
      break;
    case 'clue': {
      const b = cur!.buzz;
      const winner = s.teams.find((t) => t.id === b.winner);
      if (won) body = screen('state-won', "You're in!", 'Say your answer');
      else if (b.lockedOut.includes(team.id)) body = screen('state-out', 'Locked out', 'Back in on the next clue');
      else if (early) body = screen('state-early', 'Too early!', 'Wait for the buzzers to open');
      else if (winner) body = screen('state-locked', `${winner.name}`, 'buzzed in first');
      else if (b.open)
        body = (
          <button className="phone-body state-open" style={{ background: team.color }} onPointerDown={buzz}>
            <div className="headline" style={{ fontSize: 'clamp(3rem, 18vw, 6rem)' }}>BUZZ!</div>
            <div className="sub">Tap anywhere</div>
          </button>
        );
      else
        body = (
          <button className="phone-body state-locked" onPointerDown={buzz}>
            <div className="headline">Wait…</div>
            <div className="sub">The host is reading</div>
          </button>
        );
      break;
    }
    case 'dd_wager':
      body = s.control === team.id
        ? <DailyDoubleWager code={code} me={me} team={team} maxValue={s.maxValue} />
        : screen('state-wait', 'Daily Double!', `${controller?.name ?? 'A team'} is placing a bet`);
      break;
    case 'dd_clue':
      body = s.control === team.id
        ? screen('state-won', 'Your Daily Double', `Wager ${money(cur?.ddWager ?? 0)} · say your answer`)
        : screen('state-wait', 'Daily Double', `${controller?.name ?? ''} is answering`);
      break;
    case 'reveal':
      body = screen('state-wait', cur?.response ?? '', cur?.outcome === 'correct' ? `${controller?.name} got it` : 'Nobody got it');
      break;
    case 'final_wager':
      body = <FinalWager code={code} me={me} team={team} locked={s.final?.locked.includes(team.id) ?? false} category={s.final?.category ?? ''} />;
      break;
    case 'final_answer':
      body = <FinalResponse code={code} me={me} endsAt={s.final?.endsAt ?? null} answered={s.final?.answered.includes(team.id) ?? false} />;
      break;
    case 'final_reveal':
      body = screen('state-wait', 'Watch the TV', 'Final responses are being revealed');
      break;
    case 'podium': {
      const rank = [...s.teams].sort((a, b) => b.score - a.score).findIndex((t) => t.id === team.id) + 1;
      body = screen(rank === 1 ? 'state-won' : 'state-wait', rank === 1 ? 'You won!' : `You placed #${rank}`, `Final score ${money(team.score)}`);
      break;
    }
  }
  return (
    <div className="phone">
      {top}
      {body}
    </div>
  );
}

function DailyDoubleWager({ code, me, team, maxValue }: { code: string; me: Membership; team: Team; maxValue: number }) {
  const max = Math.max(team.score, maxValue);
  const [amount, setAmount] = useState(Math.min(500, max));
  const [error, setError] = useState<string | null>(null);
  const clamp = (n: number) => Math.max(5, Math.min(max, n));
  return (
    <div className="phone-body state-wait">
      <div className="headline" style={{ fontSize: '2rem' }}>Daily Double!</div>
      <div className="sub">Bet between $5 and {money(max)}</div>
      <div className="countdown">{money(amount)}</div>
      <div className="wager-buttons">
        <button onClick={() => setAmount(clamp(amount - 100))}>-$100</button>
        <button onClick={() => setAmount(clamp(amount + 100))}>+$100</button>
        <button onClick={() => setAmount(clamp(amount + 500))}>+$500</button>
        <button onClick={() => setAmount(5)}>Min</button>
        <button onClick={() => setAmount(clamp(Math.round(max / 2)))}>Half</button>
        <button onClick={() => setAmount(max)}>All in!</button>
      </div>
      {error && <p className="error small">{error}</p>}
      <button
        className="primary big"
        onClick={async () => {
          const { data } = await supabase.rpc('dd_wager', { p_code: code, p_token: me.token, p_amount: amount });
          if (data !== 'ok') setError('That bet was not accepted. Try again.');
        }}
      >
        Lock in {money(amount)}
      </button>
    </div>
  );
}

function FinalWager({ code, me, team, locked, category }: { code: string; me: Membership; team: Team; locked: boolean; category: string }) {
  const max = Math.max(0, team.score);
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const submit = async (value: number) => {
    setError(null);
    const { data } = await supabase.rpc('final_wager', { p_code: code, p_token: me.token, p_amount: value });
    if (data !== 'ok') setError('That wager was not accepted. Try again.');
  };
  if (locked) {
    return (
      <div className="phone-body state-wait">
        <div className="headline">Wager locked in</div>
        <div className="sub">{max > 0 ? `You bet ${money(amount)}` : 'Answer for bragging rights!'}</div>
      </div>
    );
  }
  return (
    <div className="phone-body state-wait">
      <div className="sub">Final Jeopardy · {category}</div>
      {max <= 0 ? (
        <>
          <div className="headline" style={{ fontSize: '1.8rem' }}>Your wager: $0</div>
          <div className="sub">Answer for bragging rights!</div>
          <button className="primary big" onClick={() => submit(0)}>I'm ready</button>
        </>
      ) : (
        <>
          <div className="headline" style={{ fontSize: '1.8rem' }}>Secret wager</div>
          <div className="sub">Between $0 and {money(max)}</div>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
            style={{ fontSize: '2rem', textAlign: 'center', maxWidth: 260 }}
          />
          <div className="wager-buttons">
            <button onClick={() => setAmount(0)}>$0</button>
            <button onClick={() => setAmount(Math.round(max / 2))}>Half</button>
            <button onClick={() => setAmount(max)}>All in!</button>
          </div>
          {error && <p className="error small">{error}</p>}
          <button className="primary big" onClick={() => submit(amount)}>Lock in {money(amount)}</button>
        </>
      )}
    </div>
  );
}

function FinalResponse({ code, me, endsAt, answered }: { code: string; me: Membership; endsAt: number | null; answered: boolean }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const left = useSecondsLeft(endsAt);
  const submit = async () => {
    const { data } = await supabase.rpc('final_response', { p_code: code, p_token: me.token, p_text: text });
    if (data === 'ok') setSent(text);
  };
  // Typed but not submitted when time runs out: send it anyway (the server allows a short grace period).
  useEffect(() => {
    if (left === 0 && endsAt && text.trim() && text !== sent) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  return (
    <div className="phone-body state-wait">
      <div className="countdown">{left > 0 ? `0:${String(left).padStart(2, '0')}` : "Time's up"}</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Your response" maxLength={200} style={{ fontSize: '1.3rem', maxWidth: 420 }} />
      <button className="primary big" disabled={!text.trim() || left === 0} onClick={submit}>
        {answered ? 'Update response' : 'Submit response'}
      </button>
      {sent !== null && <div className="sub">Sent: “{sent}”</div>}
    </div>
  );
}
