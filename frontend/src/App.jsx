import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';

import Login from './pages/Login';
import PassengerDashboard from './pages/PassengerDashboard';
import DriverDashboard from './pages/DriverDashboard';
import AdminDashboard from './pages/AdminDashboard';
import LiveTracking from './pages/LiveTracking';
import SearchResults from './pages/SearchResults';
import Profile from './pages/Profile';
import Journey from './pages/Journey';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="empty-state"><div className="skeleton" style={{width:40,height:40,borderRadius:'50%'}} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

const RoleRouter = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'driver') return <Navigate to="/driver" replace />;
  return <Navigate to="/passenger" replace />;
};

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RoleRouter />} />
            <Route path="/passenger" element={<ProtectedRoute allowedRoles={['passenger','driver','admin']}><PassengerDashboard /></ProtectedRoute>} />
            <Route path="/search" element={<ProtectedRoute allowedRoles={['passenger','driver','admin']}><SearchResults /></ProtectedRoute>} />
            <Route path="/journey/:busNumber" element={<ProtectedRoute allowedRoles={['passenger','driver','admin']}><Journey /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute allowedRoles={['passenger','driver','admin']}><Profile /></ProtectedRoute>} />
            <Route path="/driver" element={<ProtectedRoute allowedRoles={['driver','admin']}><DriverDashboard /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/track/:busId" element={<ProtectedRoute allowedRoles={['passenger','driver','admin']}><LiveTracking /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}
