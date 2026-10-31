export interface ClueDraft {
  text: string;
  response: string;
  image: string | null; // storage path in the clue-images bucket
}

export interface CategoryDraft {
  name: string;
  clues: ClueDraft[];
}

export interface Board {
  categories: CategoryDraft[];
  final: { category: string; text: string; response: string; image: string | null };
}

export interface Settings {
  penalty: boolean;
  dailyDoubles: boolean;
}

export interface Game {
  id: string;
  title: string;
  board: Board;
  settings: Settings;
  updated_at: string;
}

export type Phase =
  | 'lobby'
  | 'board'
  | 'clue'
  | 'dd_wager'
  | 'dd_clue'
  | 'reveal'
  | 'final_wager'
  | 'final_answer'
  | 'final_reveal'
  | 'podium';

export interface Team {
  id: string;
  name: string;
  color: string;
  score: number;
}

export interface Current {
  cat: number;
  row: number;
  value: number;
  isDD: boolean;
  text: string | null;
  imageUrl: string | null;
  response: string | null; // only filled in once revealed
  buzz: { open: boolean; winner: string | null; lockedOut: string[] };
  ddWager: number | null;
  outcome: 'correct' | 'nobody' | null;
}

export interface FinalReveal {
  teamId: string;
  response: string;
  wager: number;
  correct: boolean;
}

export interface FinalState {
  category: string;
  text: string | null;
  imageUrl: string | null;
  response: string | null;
  endsAt: number | null; // server clock, ms
  locked: string[];
  answered: string[];
  order: string[];
  index: number;
  shown: FinalReveal[];
}

// Everything in RoomState is public: TV and phones receive it.
export interface RoomState {
  phase: Phase;
  title: string;
  settings: Settings;
  maxValue: number;
  categories: { name: string; clues: { value: number; played: boolean }[] }[];
  teams: Team[];
  control: string | null;
  current: Current | null;
  final: FinalState | null;
}

// Host-only secrets for a running room.
export interface RoomPrivate {
  dailyDoubles: [number, number][];
}
