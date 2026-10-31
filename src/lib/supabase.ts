import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY);

export const IMAGE_BUCKET = 'clue-images';

// Offset between this device's clock and the database clock, so countdowns
// agree on every screen.
let clockOffset = 0;
export async function syncClock() {
  const before = Date.now();
  const { data } = await supabase.rpc('server_now');
  if (typeof data === 'number') clockOffset = data - (before + Date.now()) / 2;
}
export const serverNow = () => Date.now() + clockOffset;

export function errorMessage(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Something went wrong. Try again.';
}
