import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { RoomState } from './types';

export interface RoomSnapshot {
  roomId: string;
  state: RoomState;
  version: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newRoomCode = () =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

export const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

export async function fetchRoom(code: string): Promise<RoomSnapshot | null> {
  const { data, error } = await supabase.rpc('get_room', { p_code: code });
  if (error) throw error;
  return (data as RoomSnapshot) ?? null;
}

// Live room state: initial fetch, then database broadcasts, with a slow poll
// and refetch-on-focus as a safety net for sleeping phones and flaky Wi-Fi.
export function useRoom(code: string | null) {
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [missing, setMissing] = useState(false);
  const versionRef = useRef(-1);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    versionRef.current = -1;
    setSnap(null);
    setMissing(false);

    const accept = (s: RoomSnapshot) => {
      if (!alive || s.version <= versionRef.current) return;
      versionRef.current = s.version;
      setSnap(s);
    };
    const refresh = () =>
      fetchRoom(code)
        .then((s) => {
          if (!alive) return;
          if (s) accept(s);
          else setMissing(true);
        })
        .catch(() => {});

    refresh();
    const channel = supabase
      .channel(`room-${code}`, { config: { private: false } })
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        if (!alive || versionRef.current < 0 || payload.version <= versionRef.current) return;
        versionRef.current = payload.version;
        setSnap((prev) => prev && { roomId: prev.roomId, state: payload.state, version: payload.version });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refresh();
      });
    const poll = setInterval(refresh, 8000);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refresh);
    return () => {
      alive = false;
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refresh);
      supabase.removeChannel(channel);
    };
  }, [code]);

  return { snap, missing };
}

// Host writes use optimistic concurrency: players' database functions may
// change the row at the same moment, so on a version clash we re-read and
// re-apply the action to the fresh state.
export async function hostUpdate(roomId: string, apply: (s: RoomState) => RoomState): Promise<RoomState | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: row, error } = await supabase.from('rooms').select('state, version').eq('id', roomId).single();
    if (error) throw error;
    const next = apply(row.state as RoomState);
    if (next === row.state) return next;
    const { data: updated, error: upErr } = await supabase
      .from('rooms')
      .update({ state: next, version: row.version + 1, updated_at: new Date().toISOString() })
      .eq('id', roomId)
      .eq('version', row.version)
      .select('version');
    if (upErr) throw upErr;
    if (updated && updated.length === 1) return next;
  }
  throw new Error('The game is busy. Try again.');
}
