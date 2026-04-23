import { io } from 'socket.io-client';

function getPid() {
  let id = localStorage.getItem('cg_pid');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('cg_pid', id); }
  return id;
}

export const pid = getPid();
export default io({ transports: ['polling', 'websocket'] });
