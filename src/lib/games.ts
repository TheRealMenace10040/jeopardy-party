import { initialState, placeDailyDoubles } from './engine';
import { dataUrlToImage, imageAsDataUrl } from './images';
import { newRoomCode } from './room';
import { supabase } from './supabase';
import type { Board, Game, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = { penalty: true, dailyDoubles: true };

export function blankBoard(cats = 6, rows = 5): Board {
  return {
    categories: Array.from({ length: cats }, () => ({
      name: '',
      clues: Array.from({ length: rows }, () => ({ text: '', response: '', image: null })),
    })),
    final: { category: '', text: '', response: '', image: null },
  };
}

export async function listGames(): Promise<Game[]> {
  const { data, error } = await supabase.from('games').select('id, title, board, settings, updated_at').order('updated_at', { ascending: false });
  if (error) throw error;
  return data as Game[];
}

export async function createGame(title: string, board: Board, settings: Settings): Promise<string> {
  const { data, error } = await supabase.from('games').insert({ title, board, settings }).select('id').single();
  if (error) throw error;
  return data.id;
}

// Problems that would stop a game from being playable, in plain words.
export function missingPieces(board: Board): string[] {
  const issues: string[] = [];
  const emptyCats = board.categories.filter((c) => !c.name.trim()).length;
  if (emptyCats) issues.push(`${emptyCats} category ${emptyCats === 1 ? 'name is' : 'names are'} empty`);
  const emptyClues = board.categories.flatMap((c) => c.clues).filter((c) => !(c.text.trim() || c.image) || !c.response.trim()).length;
  if (emptyClues) issues.push(`${emptyClues} ${emptyClues === 1 ? 'clue needs' : 'clues need'} a clue and a correct response`);
  const f = board.final;
  if (!f.category.trim() || !(f.text.trim() || f.image) || !f.response.trim()) issues.push('Final Jeopardy needs a category, clue and correct response');
  return issues;
}

export async function startRoom(game: Game): Promise<string> {
  const state = initialState(game.title, game.board, game.settings);
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('rooms')
      .insert({ code: newRoomCode(), game_id: game.id, state })
      .select('id')
      .single();
    if (error?.code === '23505') continue; // code already in use
    if (error) throw error;
    const { error: privErr } = await supabase
      .from('room_private')
      .insert({ room_id: data.id, data: placeDailyDoubles(game.board, game.settings) });
    if (privErr) throw privErr;
    return data.id;
  }
  throw new Error('Could not create a room. Try again.');
}

interface ExportFile {
  app: 'jeopardy-party';
  version: 1;
  title: string;
  settings: Settings;
  board: Board;
}

// Exported files carry their photos inline so they work on any account.
export async function exportGame(game: Game) {
  const board: Board = structuredClone(game.board);
  const all = [...board.categories.flatMap((c) => c.clues), board.final];
  for (const item of all) if (item.image) item.image = await imageAsDataUrl(item.image);
  const file: ExportFile = { app: 'jeopardy-party', version: 1, title: game.title, settings: game.settings, board };
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${game.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'game'}.jeopardy.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importGame(file: File): Promise<string> {
  let parsed: ExportFile;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't a Jeopardy Party game.");
  }
  if (parsed.app !== 'jeopardy-party' || !parsed.board?.categories) throw new Error("That file isn't a Jeopardy Party game.");
  const board = parsed.board;
  const all = [...board.categories.flatMap((c) => c.clues), board.final];
  for (const item of all) if (item.image?.startsWith('data:')) item.image = await dataUrlToImage(item.image);
  return createGame(`${parsed.title} (imported)`, board, { ...DEFAULT_SETTINGS, ...parsed.settings });
}
