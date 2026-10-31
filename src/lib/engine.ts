// Pure game rules. The host's device is the only writer of these
// transitions; players change state only through database functions.
import type { Board, Current, RoomPrivate, RoomState, Settings } from './types';

export const clueValue = (row: number) => (row + 1) * 200;

export function initialState(title: string, board: Board, settings: Settings): RoomState {
  const rows = board.categories[0]?.clues.length ?? 5;
  return {
    phase: 'lobby',
    title,
    settings,
    maxValue: clueValue(rows - 1),
    categories: board.categories.map((c) => ({
      name: c.name,
      clues: c.clues.map((_, row) => ({ value: clueValue(row), played: false })),
    })),
    teams: [],
    control: null,
    current: null,
    final: null,
  };
}

// One Daily Double per board, two on boards with 20+ clues; never in the cheapest row.
export function placeDailyDoubles(board: Board, settings: Settings): RoomPrivate {
  if (!settings.dailyDoubles) return { dailyDoubles: [] };
  const cats = board.categories.length;
  const rows = board.categories[0]?.clues.length ?? 0;
  const cells: [number, number][] = [];
  for (let c = 0; c < cats; c++) for (let r = 1; r < rows; r++) cells.push([c, r]);
  const count = cats * rows >= 20 ? 2 : 1;
  const picked: [number, number][] = [];
  while (picked.length < count && cells.length) {
    const i = Math.floor(Math.random() * cells.length);
    const [cell] = cells.splice(i, 1);
    // Two Daily Doubles never share a category.
    if (!picked.some(([c]) => c === cell[0])) picked.push(cell);
  }
  return { dailyDoubles: picked };
}

const freshBuzz = () => ({ open: false, winner: null, lockedOut: [] as string[] });

export function pickClue(s: RoomState, board: Board, priv: RoomPrivate, cat: number, row: number, imageUrl: string | null): RoomState {
  const isDD = priv.dailyDoubles.some(([c, r]) => c === cat && r === row) && s.control !== null;
  const clue = board.categories[cat].clues[row];
  const current: Current = {
    cat,
    row,
    value: clueValue(row),
    isDD,
    text: isDD ? null : clue.text,
    imageUrl: isDD ? null : imageUrl,
    response: null,
    buzz: freshBuzz(),
    ddWager: null,
    outcome: null,
  };
  return { ...s, phase: isDD ? 'dd_wager' : 'clue', current };
}

// Called once the Daily Double wager is in (phase moves to dd_clue in the database).
export function showDailyDoubleClue(s: RoomState, board: Board, imageUrl: string | null): RoomState {
  if (!s.current) return s;
  const clue = board.categories[s.current.cat].clues[s.current.row];
  return { ...s, current: { ...s.current, text: clue.text, imageUrl } };
}

export const openBuzzers = (s: RoomState): RoomState =>
  s.current ? { ...s, current: { ...s.current, buzz: { ...s.current.buzz, open: true } } } : s;

const addScore = (s: RoomState, teamId: string, delta: number) =>
  s.teams.map((t) => (t.id === teamId ? { ...t, score: t.score + delta } : t));

function reveal(s: RoomState, board: Board, outcome: 'correct' | 'nobody'): RoomState {
  const cur = s.current!;
  const response = board.categories[cur.cat].clues[cur.row].response;
  return { ...s, phase: 'reveal', current: { ...cur, response, outcome, buzz: { ...cur.buzz, open: false } } };
}

export function judge(s: RoomState, board: Board, correct: boolean): RoomState {
  const cur = s.current;
  if (!cur) return s;
  const dd = s.phase === 'dd_clue';
  const who = dd ? s.control : cur.buzz.winner;
  if (!who) return s;
  const amount = dd ? cur.ddWager ?? 0 : cur.value;
  if (correct) {
    return reveal({ ...s, teams: addScore(s, who, amount), control: who }, board, 'correct');
  }
  // A Daily Double wager is a bet, so it is always lost on a miss.
  const teams = dd || s.settings.penalty ? addScore(s, who, -amount) : s.teams;
  if (dd) return reveal({ ...s, teams }, board, 'nobody');
  const lockedOut = [...cur.buzz.lockedOut, who];
  const next = { ...s, teams, current: { ...cur, buzz: { open: true, winner: null, lockedOut } } };
  return lockedOut.length >= s.teams.length ? reveal(next, board, 'nobody') : next;
}

export const endClue = (s: RoomState, board: Board): RoomState => (s.current ? reveal(s, board, 'nobody') : s);

export function backToBoard(s: RoomState): RoomState {
  const cur = s.current;
  if (!cur) return { ...s, phase: 'board' };
  const categories = s.categories.map((c, ci) => ({
    ...c,
    clues: c.clues.map((cl, ri) => (ci === cur.cat && ri === cur.row ? { ...cl, played: true } : cl)),
  }));
  return { ...s, phase: 'board', current: null, categories };
}

export const boardDone = (s: RoomState) => s.categories.every((c) => c.clues.every((cl) => cl.played));

export function startFinal(s: RoomState, board: Board): RoomState {
  return {
    ...s,
    phase: 'final_wager',
    current: null,
    final: {
      category: board.final.category,
      text: null,
      imageUrl: null,
      response: null,
      endsAt: null,
      locked: [],
      answered: [],
      order: [],
      index: 0,
      shown: [],
    },
  };
}

export const FINAL_SECONDS = 30;

export function revealFinalClue(s: RoomState, board: Board, imageUrl: string | null, now: number): RoomState {
  if (!s.final) return s;
  return {
    ...s,
    phase: 'final_answer',
    final: { ...s.final, text: board.final.text, imageUrl, endsAt: now + FINAL_SECONDS * 1000 },
  };
}

export const addFinalTime = (s: RoomState, seconds: number): RoomState =>
  s.final?.endsAt ? { ...s, final: { ...s.final, endsAt: s.final.endsAt + seconds * 1000 } } : s;

// Lowest score is revealed first.
export function startFinalReveal(s: RoomState): RoomState {
  if (!s.final) return s;
  const order = [...s.teams].sort((a, b) => a.score - b.score).map((t) => t.id);
  return { ...s, phase: 'final_reveal', final: { ...s.final, order, index: 0, shown: [] } };
}

export function judgeFinal(s: RoomState, board: Board, response: string, wager: number, correct: boolean): RoomState {
  const f = s.final;
  if (!f || f.index >= f.order.length) return s;
  const teamId = f.order[f.index];
  const teams = addScore(s, teamId, correct ? wager : -wager);
  const index = f.index + 1;
  return {
    ...s,
    teams,
    final: {
      ...f,
      index,
      shown: [...f.shown, { teamId, response, wager, correct }],
      response: index >= f.order.length ? board.final.response : f.response,
    },
  };
}

export const showPodium = (s: RoomState): RoomState => ({ ...s, phase: 'podium' });

export const setScore = (s: RoomState, teamId: string, score: number): RoomState => ({
  ...s,
  teams: s.teams.map((t) => (t.id === teamId ? { ...t, score } : t)),
});

export const setControl = (s: RoomState, teamId: string): RoomState => ({ ...s, control: teamId });

// Undo restores a snapshot but keeps teams that joined since then.
export function restore(now: RoomState, snap: RoomState): RoomState {
  const scores = new Map(snap.teams.map((t) => [t.id, t.score]));
  return { ...snap, teams: now.teams.map((t) => ({ ...t, score: scores.get(t.id) ?? t.score })) };
}
