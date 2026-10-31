import { Link, useNavigate } from 'react-router-dom';
import { CodeForm } from '../components/CodeForm';

export function Home() {
  const navigate = useNavigate();
  return (
    <div className="page narrow stack" style={{ paddingTop: 48 }}>
      <h1 className="brand" style={{ fontSize: '3rem', textAlign: 'center' }}>Jeopardy Party</h1>
      <div className="card">
        <CodeForm label="Got a room code? Join your team" button="Join game" onSubmit={(c) => navigate(`/join/${c}`)} />
      </div>
      <div className="card stack">
        <h2>Hosting?</h2>
        <p className="muted">Build a board, then run the game from your phone or tablet while the TV shows the board.</p>
        <button className="big" style={{ width: '100%' }} onClick={() => navigate('/host')}>Host a game</button>
      </div>
      <p className="muted small" style={{ textAlign: 'center' }}>
        Setting up the TV? <Link to="/tv">Open the TV view</Link>
      </p>
    </div>
  );
}
