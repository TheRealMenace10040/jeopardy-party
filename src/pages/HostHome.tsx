import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithGoogle, signOut, useSession } from '../lib/auth';
import { blankBoard, createGame, DEFAULT_SETTINGS, exportGame, importGame, listGames, missingPieces, startRoom } from '../lib/games';
import { SAMPLE_BOARD, SAMPLE_SETTINGS, SAMPLE_TITLE } from '../lib/sampleGame';
import { errorMessage, supabase } from '../lib/supabase';
import type { Game } from '../lib/types';

interface RecentRoom {
  id: string;
  code: string;
  created_at: string;
  state: { title: string; phase: string };
}

export function HostHome() {
  const session = useSession();
  if (session === undefined) return <div className="page muted">Loading…</div>;
  if (!session) {
    return (
      <div className="page narrow stack" style={{ paddingTop: 48 }}>
        <h1 className="brand" style={{ textAlign: 'center' }}>Host a game</h1>
        <div className="card stack">
          <p>Sign in to build boards and keep them for next time. Players never need an account.</p>
          <button className="primary big" style={{ width: '100%' }} onClick={() => signInWithGoogle()}>Sign in with Google</button>
        </div>
      </div>
    );
  }
  return <GamesList email={session.user.email ?? ''} />;
}

function GamesList({ email }: { email: string }) {
  const navigate = useNavigate();
  const [games, setGames] = useState<Game[] | null>(null);
  const [rooms, setRooms] = useState<RecentRoom[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setGames(await listGames());
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await supabase.from('rooms').select('id, code, created_at, state').gte('created_at', since).order('created_at', { ascending: false });
      setRooms(((data ?? []) as RecentRoom[]).filter((r) => r.state.phase !== 'podium'));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const play = (g: Game) => {
    const issues = missingPieces(g.board);
    if (issues.length && !confirm(`This game isn't finished:\n• ${issues.join('\n• ')}\n\nPlay anyway?`)) return;
    act(`play-${g.id}`, async () => navigate(`/host/room/${await startRoom(g)}`));
  };

  return (
    <div className="page stack">
      <div className="row spread">
        <h1 className="brand">Your games</h1>
        <div className="row small muted">
          {email}
          <button className="link" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>

      {rooms.length > 0 && (
        <div className="card stack">
          <h3>Games in progress</h3>
          {rooms.map((r) => (
            <div key={r.id} className="row spread">
              <span>{r.state.title} · room <span className="code">{r.code}</span></span>
              <button onClick={() => navigate(`/host/room/${r.id}`)}>Rejoin as host</button>
            </div>
          ))}
        </div>
      )}

      <div className="row">
        <button className="primary" disabled={!!busy} onClick={() => act('new', async () => navigate(`/host/edit/${await createGame('Untitled game', blankBoard(), DEFAULT_SETTINGS)}`))}>
          New game
        </button>
        <button disabled={!!busy} onClick={() => act('sample', async () => { await createGame(SAMPLE_TITLE, SAMPLE_BOARD, SAMPLE_SETTINGS); await load(); })}>
          Add tester game
        </button>
        <button disabled={!!busy} onClick={() => fileRef.current?.click()}>Import</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) act('import', async () => { await importGame(file); await load(); });
          }}
        />
        {busy && <span className="muted small">Working…</span>}
      </div>
      {error && <p className="error">{error}</p>}

      {games === null ? (
        <p className="muted">Loading your games…</p>
      ) : games.length === 0 ? (
        <div className="card">
          <h3>Make your first board</h3>
          <p className="muted">Start from scratch with New game, or add the tester game to try everything out.</p>
        </div>
      ) : (
        <div className="games-list">
          {games.map((g) => {
            const issues = missingPieces(g.board);
            return (
              <div key={g.id} className="card row spread">
                <div>
                  <div style={{ fontWeight: 800 }}>{g.title}</div>
                  <div className="muted small">
                    {g.board.categories.length} categories × {g.board.categories[0]?.clues.length ?? 0} clues
                    {issues.length ? ' · not finished' : ''}
                  </div>
                </div>
                <div className="row">
                  <button className="primary" disabled={!!busy} onClick={() => play(g)}>Play</button>
                  <button onClick={() => navigate(`/host/edit/${g.id}`)}>Edit</button>
                  <button disabled={!!busy} onClick={() => act('dup', async () => { await createGame(`${g.title} (copy)`, g.board, g.settings); await load(); })}>Duplicate</button>
                  <button disabled={!!busy} onClick={() => act('export', () => exportGame(g))}>Export</button>
                  <button
                    className="bad"
                    disabled={!!busy}
                    onClick={() => confirm(`Delete "${g.title}"? This can't be undone.`) && act('del', async () => { await supabase.from('games').delete().eq('id', g.id); await load(); })}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
