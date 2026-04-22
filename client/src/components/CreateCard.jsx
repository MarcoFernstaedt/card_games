import { useState } from 'react';
import socket from '../socket';

export default function CreateCard({ roomCode, myScore, myCustomCount, onClose }) {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const maxAllowed = Math.floor(myScore / 3);

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
        Your custom card will be added to the white card deck for everyone to draw.
        You've used {myCustomCount} of {maxAllowed} custom card slots.
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
