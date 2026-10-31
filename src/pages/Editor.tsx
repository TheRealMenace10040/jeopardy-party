import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clueValue } from '../lib/engine';
import { missingPieces } from '../lib/games';
import { signedImageUrl, uploadImage } from '../lib/images';
import { errorMessage, supabase } from '../lib/supabase';
import type { Board, ClueDraft, Game } from '../lib/types';

const emptyClue = (): ClueDraft => ({ text: '', response: '', image: null });

export function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ cat: number; row: number } | 'final' | null>(null);

  useEffect(() => {
    supabase.from('games').select('id, title, board, settings, updated_at').eq('id', id).single().then(({ data, error }) => {
      if (error) setStatus(errorMessage(error));
      else setGame(data as Game);
    });
  }, [id]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!game) return <div className="page muted">{status ?? 'Loading…'}</div>;
  const board = game.board;
  const cats = board.categories.length;
  const rows = board.categories[0]?.clues.length ?? 5;

  const update = (patch: Partial<Game>) => {
    setGame({ ...game, ...patch });
    setDirty(true);
    setStatus(null);
  };
  const setBoard = (b: Board) => update({ board: b });

  const resize = (newCats: number, newRows: number) => {
    const dropping =
      board.categories.slice(newCats).some((c) => c.name || c.clues.some((cl) => cl.text || cl.response)) ||
      board.categories.some((c) => c.clues.slice(newRows).some((cl) => cl.text || cl.response));
    if (dropping && !confirm('Shrinking the board removes the clues outside it. Continue?')) return;
    const categories = Array.from({ length: newCats }, (_, ci) => {
      const c = board.categories[ci] ?? { name: '', clues: [] };
      return { name: c.name, clues: Array.from({ length: newRows }, (_, ri) => c.clues[ri] ?? emptyClue()) };
    });
    setBoard({ ...board, categories });
  };

  const save = async () => {
    setStatus('Saving…');
    const { error } = await supabase
      .from('games')
      .update({ title: game.title, board: game.board, settings: game.settings, updated_at: new Date().toISOString() })
      .eq('id', game.id);
    if (error) return setStatus(errorMessage(error));
    setDirty(false);
    setStatus('Saved');
  };

  const issues = missingPieces(board);

  return (
    <div className="page stack">
      <div className="row spread">
        <button className="link" onClick={() => (!dirty || confirm('Leave without saving?')) && navigate('/host')}>← Your games</button>
        <div className="row">
          {status && <span className="muted small">{status}</span>}
          <button className="primary" disabled={!dirty} onClick={save}>Save</button>
        </div>
      </div>

      <div className="card stack">
        <div>
          <label htmlFor="title">Game name</label>
          <input id="title" value={game.title} onChange={(e) => update({ title: e.target.value })} />
        </div>
        <div className="row">
          <div>
            <label htmlFor="cats">Categories</label>
            <select id="cats" value={cats} onChange={(e) => resize(Number(e.target.value), rows)}>
              {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rows">Clues per category</label>
            <select id="rows" value={rows} onChange={(e) => resize(cats, Number(e.target.value))}>
              {[3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={game.settings.penalty} onChange={(e) => update({ settings: { ...game.settings, penalty: e.target.checked } })} />
          <span><b style={{ color: 'var(--ink)' }}>Lose points for wrong answers</b><br />Wrong answers subtract the clue's value.</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={game.settings.dailyDoubles} onChange={(e) => update({ settings: { ...game.settings, dailyDoubles: e.target.checked } })} />
          <span><b style={{ color: 'var(--ink)' }}>Daily Doubles</b><br />{cats * rows >= 20 ? 'Two hidden clues' : 'One hidden clue'} where a team bets its own points. Placed at random each game.</span>
        </label>
      </div>

      <div className="editor-grid" style={{ gridTemplateColumns: `repeat(${cats}, minmax(0, 1fr))` }}>
        {board.categories.map((c, ci) => (
          <input
            key={`c${ci}`}
            className="cat-input"
            value={c.name}
            placeholder={`Category ${ci + 1}`}
            aria-label={`Category ${ci + 1} name`}
            onChange={(e) => setBoard({ ...board, categories: board.categories.map((x, i) => (i === ci ? { ...x, name: e.target.value } : x)) })}
          />
        ))}
        {Array.from({ length: rows }, (_, ri) =>
          board.categories.map((c, ci) => {
            const cl = c.clues[ri];
            const filled = cl.text || cl.response || cl.image;
            return (
              <button key={`${ci}-${ri}`} className={`editor-cell${filled ? '' : ' empty'}`} onClick={() => setEditing({ cat: ci, row: ri })}>
                <span className="val">${clueValue(ri)}{cl.image ? ' · photo' : ''}</span>
                <span>{cl.text || <span className="muted">Add clue</span>}</span>
                {cl.response && <span className="muted">→ {cl.response}</span>}
              </button>
            );
          }),
        )}
      </div>

      <div className="card stack">
        <h3>Final Jeopardy</h3>
        <button className="editor-cell" style={{ width: '100%' }} onClick={() => setEditing('final')}>
          <span className="val">{board.final.category || 'Add a category'}{board.final.image ? ' · photo' : ''}</span>
          <span>{board.final.text || <span className="muted">Add the final clue</span>}</span>
          {board.final.response && <span className="muted">→ {board.final.response}</span>}
        </button>
      </div>

      {issues.length > 0 && <p className="muted small">Still to do: {issues.join(' · ')}</p>}

      {editing && (
        <ClueModal
          title={editing === 'final' ? 'Final Jeopardy' : `${board.categories[editing.cat].name || `Category ${editing.cat + 1}`} · $${clueValue(editing.row)}`}
          isFinal={editing === 'final'}
          clue={editing === 'final' ? board.final : board.categories[editing.cat].clues[editing.row]}
          category={board.final.category}
          onClose={() => setEditing(null)}
          onSave={(clue, category) => {
            if (editing === 'final') setBoard({ ...board, final: { ...clue, category: category ?? '' } });
            else
              setBoard({
                ...board,
                categories: board.categories.map((c, ci) =>
                  ci === editing.cat ? { ...c, clues: c.clues.map((x, ri) => (ri === editing.row ? clue : x)) } : c,
                ),
              });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

interface ModalProps {
  title: string;
  isFinal: boolean;
  clue: ClueDraft;
  category: string;
  onClose: () => void;
  onSave: (clue: ClueDraft, category?: string) => void;
}

function ClueModal({ title, isFinal, clue, category: initialCategory, onClose, onSave }: ModalProps) {
  const [draft, setDraft] = useState<ClueDraft>({ text: clue.text, response: clue.response, image: clue.image });
  const [category, setCategory] = useState(initialCategory);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    signedImageUrl(draft.image, 600).then(setPreview);
  }, [draft.image]);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal card stack" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {isFinal && (
          <div>
            <label htmlFor="fcat">Category (shown before wagers)</label>
            <input id="fcat" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
        )}
        <div>
          <label htmlFor="clue">Clue (what the host reads out)</label>
          <textarea id="clue" autoFocus value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
        </div>
        <div>
          <label htmlFor="resp">Correct response (only the host sees this)</label>
          <input id="resp" value={draft.response} onChange={(e) => setDraft({ ...draft, response: e.target.value })} />
        </div>
        <div className="stack">
          <label>Photo (optional, shown on the TV)</label>
          {preview && <img className="thumb" src={preview} alt="" />}
          <div className="row">
            <label className="small" style={{ margin: 0 }}>
              <span className="muted">{uploading ? 'Uploading…' : draft.image ? 'Replace photo:' : 'Add photo:'}</span>
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  setError(null);
                  try {
                    setDraft({ ...draft, image: await uploadImage(file) });
                  } catch (err) {
                    setError(errorMessage(err));
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
            {draft.image && <button className="link" onClick={() => setDraft({ ...draft, image: null })}>Remove photo</button>}
          </div>
          {error && <p className="error small">{error}</p>}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={uploading} onClick={() => onSave(draft, isFinal ? category : undefined)}>Done</button>
        </div>
      </div>
    </div>
  );
}
