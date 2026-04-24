import { useState } from 'react';
import socket from '../socket';

export default function CreateCard({ roomCode, myCustomCount, onClose }) {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    if (!text.trim()) return;
    socket.emit('cah_create_card', { code: roomCode, cardText: text.trim() });
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setText('');
      onClose();
    }, 2000);
  }

  return (
    <div className="create-card-panel">
      <h3>✨ Create a Custom Card</h3>
      <p>
        Create your own white card. If your hand has room, it is added to your hand right away; otherwise it goes into the shared deck.
        You've created {myCustomCount} custom card{myCustomCount === 1 ? '' : 's'} this game.
      </p>

      {submitted ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--accent)', fontWeight: 700 }}>
          Card added to the deck!
        </div>
      ) : (
        <>
          <textarea
            placeholder="Write something wild and inappropriate..."
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={150}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn-sm" onClick={handleSubmit} disabled={!text.trim()}>
              Add to Deck
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.88rem', fontFamily: 'inherit' }}
            >
              Cancel
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginLeft: 'auto' }}>
              {text.length}/150
            </span>
          </div>
        </>
      )}
    </div>
  );
}
