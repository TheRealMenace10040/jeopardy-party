import type { Team } from '../lib/types';

export const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString()}`;

interface Props {
  teams: Team[];
  control?: string | null;
  onTeamClick?: (team: Team) => void;
}

export function Scoreboard({ teams, control, onTeamClick }: Props) {
  if (!teams.length) return null;
  return (
    <div className="scores">
      {teams.map((t) => {
        const inner = (
          <>
            <div className="name" style={{ color: t.color }}>{t.name}</div>
            <div className={`pts${t.score < 0 ? ' neg' : ''}`}>{money(t.score)}</div>
          </>
        );
        const cls = `score${control === t.id ? ' control' : ''}`;
        const style = { borderColor: t.color };
        return onTeamClick ? (
          <button key={t.id} className={cls} style={style} onClick={() => onTeamClick(t)}>{inner}</button>
        ) : (
          <div key={t.id} className={cls} style={style}>{inner}</div>
        );
      })}
    </div>
  );
}
