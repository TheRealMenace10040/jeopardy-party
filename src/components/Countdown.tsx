import { useEffect, useState } from 'react';
import { serverNow } from '../lib/supabase';

export function useSecondsLeft(endsAt: number | null | undefined) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - serverNow()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return left;
}

export function Countdown({ endsAt }: { endsAt: number | null | undefined }) {
  const left = useSecondsLeft(endsAt);
  return <div className="countdown">{left > 0 ? `0:${String(left).padStart(2, '0')}` : "Time's up"}</div>;
}
