import { useState } from 'react';
import { normalizeCode } from '../lib/room';

interface Props {
  label: string;
  button: string;
  onSubmit: (code: string) => void;
  error?: string | null;
}

export function CodeForm({ label, button, onSubmit, error }: Props) {
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const valid = normalizeCode(code).length === 4;
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (valid) onSubmit(normalizeCode(code));
      }}
    >
      <label htmlFor="code">{label}</label>
      <input
        id="code"
        value={code}
        onChange={(e) => setCode(normalizeCode(e.target.value))}
        placeholder="K7QM"
        autoCapitalize="characters"
        autoComplete="off"
        className="code"
        style={{ fontSize: '2rem', textAlign: 'center' }}
      />
      {touched && !valid && <p className="error small">Room codes are 4 letters or numbers.</p>}
      {error && <p className="error small">{error}</p>}
      <button className="primary big" type="submit" style={{ width: '100%' }}>{button}</button>
    </form>
  );
}
