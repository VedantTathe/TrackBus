import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

// Configure dynamic API baseURL for production environments (e.g. Render, Railway)
const apiUrl = import.meta.env.VITE_API_URL || '';
if (apiUrl) {
  axios.defaults.baseURL = apiUrl;
}

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('trackbus_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const stored = localStorage.getItem('trackbus_user');
      if (stored) {
        try { setUser(JSON.parse(stored)); } catch (e) { logout(); }
      }
    }
    setLoading(false);
  }, []);

  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('trackbus_token', authToken);
    localStorage.setItem('trackbus_user', JSON.stringify(userData));
    axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('trackbus_token');
    localStorage.removeItem('trackbus_user');
    delete axios.defaults.headers.common['Authorization'];
  };

  const updateProfile = (updates) => {
    setUser((prev) => {
      const next = { ...prev, ...updates };
      localStorage.setItem('trackbus_user', JSON.stringify(next));
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
