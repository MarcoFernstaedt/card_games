import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './components/index.css';

// StrictMode disabled: it double-invokes effects in dev, which causes socket
// listeners to be registered twice before cleanup runs.
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
