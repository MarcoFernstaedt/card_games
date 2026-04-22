import { io } from 'socket.io-client';

// Start with polling for maximum cross-device/proxy compatibility, then upgrade to WebSocket
const socket = io({ transports: ['polling', 'websocket'] });

export default socket;
