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
      const s = io(socketUrl, {
        // Vercel serverless does NOT support raw WebSocket — use polling first,
        // then upgrade to WebSocket if the environment supports it.
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        timeout: 20000
      });
      s.on('connect', () => {
        console.log(`🔌 Socket connected (${s.io.engine.transport.name})`);
        setConnected(true);
      });
      s.on('disconnect', () => setConnected(false));
      s.on('connect_error', (err) => {
        console.warn('Socket connection error:', err.message);
        // Don't crash the app — HTTP polling fallback handles real-time updates
      });
      socketRef.current = s;
    }

    setSocket(socketRef.current);

    return () => {
      cleanupTimerRef.current = setTimeout(() => {
        socketRef.current?.disconnect();
        socketRef.current = null;
        setConnected(false);
      }, 2000); // 2s grace period to avoid disconnecting on normal page navigation
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
