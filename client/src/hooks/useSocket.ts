import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001', {
      autoConnect: true,
    });
  }
  return socketInstance;
}

export function useSocket() {
  const socket = useRef<Socket>(getSocket());

  useEffect(() => {
    if (!socket.current.connected) {
      socket.current.connect();
    }
  }, []);

  return socket.current;
}
