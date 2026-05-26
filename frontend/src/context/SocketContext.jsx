import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const cleanupTimerRef = useRef(null);

  useEffect(() => {
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }

    if (!socketRef.current) {
      const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
      const s = io(socketUrl, { transports: ['websocket', 'polling'] });
      s.on('connect', () => setConnected(true));
      s.on('disconnect', () => setConnected(false));
      socketRef.current = s;
    }

    setSocket(socketRef.current);

    return () => {
      cleanupTimerRef.current = setTimeout(() => {
        socketRef.current?.disconnect();
        socketRef.current = null;
        setConnected(false);
      }, 0);
    };
  }, []);

  const sendLocationUpdate = (data) => {
    if (socket && connected) socket.emit('driver-location-update', data);
  };

  return (
    <SocketContext.Provider value={{ socket, connected, sendLocationUpdate }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
