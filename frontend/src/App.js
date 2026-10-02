import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import LoginPage from './components/LoginPage';
import SearchHomePage from './components/SearchHomePage';
import VisionUploadPage from './components/VisionUploadPage';
import AnalyticsPage from './components/AnalyticsPage';
import LiveCamerasPage from './components/LiveCamerasPage';
import TerminalMapPage from './components/TerminalMapPage';
import AlertsPage from './components/AlertsPage';
import NotificationsPage from './components/NotificationsPage';
import UsersPage from './components/UsersPage';
import RolesPage from './components/RolesPage';
import AuditLogPage from './components/AuditLogPage';
import SecurityPage from './components/SecurityPage';
import ProfilePage from './components/ProfilePage';
import ChangePasswordPage from './components/ChangePasswordPage';
import SessionsPage from './components/SessionsPage';
import SettingsPage from './components/SettingsPage';
import UnauthorizedPage from './components/UnauthorizedPage';
import ContainerDetailPage from './components/ContainerDetailPage';
import './styles/design-system.css';
import './styles/theme-dark.css';
import './App.css';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <span className="spinner" /> Chargement...
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

// Route protégée + contrôle de permission RBAC.
function PermissionRoute({ permission, children }) {
  const { isAuthenticated, loading, hasPermission } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <span className="spinner" /> Chargement...
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (permission && !hasPermission(permission)) return <UnauthorizedPage />;
  return children;
}

function LoginRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <span className="spinner" /> Chargement...
      </div>
    );
  }

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />;
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <div className="app">
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/dashboard" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
            <Route path="/analytics" element={<Navigate to="/dashboard" replace />} />
            <Route path="/search" element={<PermissionRoute permission="containers.search"><SearchHomePage /></PermissionRoute>} />
            <Route path="/vision-upload" element={<PermissionRoute permission="uploads.create"><VisionUploadPage /></PermissionRoute>} />
            <Route path="/live-cameras" element={<PermissionRoute permission="cameras.read"><LiveCamerasPage /></PermissionRoute>} />
            <Route path="/terminal-map" element={<PermissionRoute permission="terminal_map.read"><TerminalMapPage /></PermissionRoute>} />
            <Route path="/alerts" element={<PermissionRoute permission="alerts.read"><AlertsPage /></PermissionRoute>} />
            <Route path="/notifications" element={<PermissionRoute permission="notifications.read"><NotificationsPage /></PermissionRoute>} />
            <Route path="/users" element={<PermissionRoute permission="users.read"><UsersPage /></PermissionRoute>} />
            <Route path="/roles" element={<PermissionRoute permission="users.read"><RolesPage /></PermissionRoute>} />
            <Route path="/audit" element={<PermissionRoute permission="audit.read"><AuditLogPage /></PermissionRoute>} />
            <Route path="/security" element={<ProtectedRoute><SecurityPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
            <Route path="/sessions" element={<ProtectedRoute><SessionsPage /></ProtectedRoute>} />
            <Route path="/settings" element={<PermissionRoute permission="settings.manage"><SettingsPage /></PermissionRoute>} />
            <Route path="/containers/:code" element={<PermissionRoute permission="containers.read_tracking"><ContainerDetailPage /></PermissionRoute>} />
            {/* Alias singulier pour les liens externes (WhatsApp / Marsa Maroc AI) */}
            <Route path="/container/:code" element={<PermissionRoute permission="containers.read_tracking"><ContainerDetailPage /></PermissionRoute>} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </div>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
