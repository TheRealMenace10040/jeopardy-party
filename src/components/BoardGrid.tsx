import type { RoomState } from '../lib/types';

interface Props {
  state: RoomState;
  className?: string;
  onPick?: (cat: number, row: number) => void;
  dailyDoubles?: [number, number][]; // host-only marker
}

export function BoardGrid({ state, className = '', onPick, dailyDoubles = [] }: Props) {
  const cats = state.categories;
  const rows = cats[0]?.clues.length ?? 0;
  const isDD = (c: number, r: number) => dailyDoubles.some(([dc, dr]) => dc === c && dr === r);
  return (
    <div
      className={`board ${className}`}
      style={{ gridTemplateColumns: `repeat(${cats.length}, minmax(0, 1fr))`, gridTemplateRows: `auto repeat(${rows}, 1fr)` }}
    >
      {cats.map((c, i) => (
        <div key={`h${i}`} className="cat">{c.name}</div>
      ))}
      {Array.from({ length: rows }, (_, r) =>
        cats.map((c, ci) => {
          const clue = c.clues[r];
          const cls = `cell${clue.played ? ' played' : ''}${isDD(ci, r) && !clue.played ? ' dd' : ''}`;
          return onPick && !clue.played ? (
            <button key={`${ci}-${r}`} className={cls} onClick={() => onPick(ci, r)}>${clue.value}</button>
          ) : (
            <div key={`${ci}-${r}`} className={cls}>${clue.value}</div>
          );
        }),
      )}
    </div>
  );
}
