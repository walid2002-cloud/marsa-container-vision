import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '/api';
const AI_SERVICE_URL = process.env.REACT_APP_AI_SERVICE_URL || 'http://localhost:5082';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('marsa_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function clearSession() {
  localStorage.removeItem('marsa_token');
  localStorage.removeItem('marsa_refresh_token');
}

// Phase 6 : rafraîchissement automatique du token d'accès sur 401 (une seule fois).
// Un 403 (permission insuffisante) NE déconnecte PAS l'utilisateur : la page
// affiche « Accès non autorisé ».
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const errorMessage = error.response?.data?.error || '';
    const isAuthEndpoint = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');
    const isInvalidToken = status === 403 && /token invalide|expir/i.test(errorMessage);

    if ((status === 401 || isInvalidToken) && !original?._retry && !isAuthEndpoint) {
      const refreshToken = localStorage.getItem('marsa_refresh_token');
      if (refreshToken) {
        original._retry = true;
        try {
          const res = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken });
          if (res.data?.success && res.data.data?.token) {
            localStorage.setItem('marsa_token', res.data.data.token);
            if (res.data.data.refresh_token) {
              localStorage.setItem('marsa_refresh_token', res.data.data.refresh_token);
            }
            original.headers.Authorization = `Bearer ${res.data.data.token}`;
            return apiClient(original);
          }
        } catch (_) { /* refresh échoué : déconnexion */ }
      }
      clearSession();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export async function loginAdmin(email, password) {
  const response = await apiClient.post('/auth/login', { email, password });
  return response.data;
}

export async function verifyMfaLogin(mfaToken, code) {
  const response = await apiClient.post('/auth/mfa/verify', { mfa_token: mfaToken, code });
  return response.data;
}

export async function logoutApi() {
  const refreshToken = localStorage.getItem('marsa_refresh_token');
  try {
    await apiClient.post('/auth/logout', { refresh_token: refreshToken });
  } catch (_) { /* best effort */ }
}

export async function getMe() {
  const response = await apiClient.get('/auth/me');
  return response.data;
}

export async function searchContainer(containerCode) {
  const response = await apiClient.post('/search-container', {
    container_code: containerCode,
  });
  return response.data;
}

export async function getDetections() {
  const response = await apiClient.get('/detections');
  return response.data;
}

export async function getSearchHistory() {
  const response = await apiClient.get('/search-history');
  return response.data;
}

export async function checkHealth() {
  try {
    const response = await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 5000 });
    return response.data;
  } catch {
    return { detection_mode: 'mock', experimental_available: false };
  }
}

/**
 * Upload image pour analyse OCR (multipart). Ne fixe pas Content-Type pour laisser la boundary.
 */
export async function uploadVisionImage(formData) {
  const response = await apiClient.post('/vision/upload', formData, {
    timeout: 300000,
    transformRequest: [(data, headers) => {
      delete headers['Content-Type'];
      return data;
    }],
  });
  return response.data;
}

export async function listCameras() {
  const response = await apiClient.get('/cameras');
  return response.data;
}

export async function getAnalyticsSummary() {
  const response = await apiClient.get('/analytics/summary');
  return response.data;
}

// Notifications "dashboard" (cloche) — déplacées vers /dashboard-notifications (Phase 4).
export async function getNotifications(limit = 50) {
  const response = await apiClient.get('/dashboard-notifications', { params: { limit } });
  return response.data;
}

export async function getCamerasLiveBoard() {
  const response = await apiClient.get('/cameras/live-board');
  return response.data;
}

export async function analyzeCamera(cameraId) {
  const response = await apiClient.post(`/cameras/${encodeURIComponent(cameraId)}/analyze`);
  return response.data;
}

export async function scanAllCameras() {
  const response = await apiClient.post('/cameras/scan-all', {}, { timeout: 180000 });
  return response.data;
}

export async function advanceCameraFrame(cameraId) {
  const response = await apiClient.post(`/cameras/${encodeURIComponent(cameraId)}/next-frame`);
  return response.data;
}

export async function attachFrameToCamera(cameraId, evidencePath, primaryCode) {
  const response = await apiClient.post(`/cameras/${encodeURIComponent(cameraId)}/attach-frame`, {
    camera_id: cameraId,
    evidence_path: evidencePath,
    primary_code: primaryCode || null,
  });
  return response.data;
}

export async function getContainerPosition(code) {
  const response = await apiClient.get(`/containers/${encodeURIComponent(code)}/position`);
  return response.data;
}

export async function getContainerMovements(code, limit = 20) {
  const response = await apiClient.get(`/containers/${encodeURIComponent(code)}/movements`, {
    params: { limit },
  });
  return response.data;
}

export async function getTerminalMap(limit = 12) {
  const response = await apiClient.get('/terminal-map', { params: { limit } });
  return response.data;
}

// Phase 7 — Rapport conteneur, preuves visuelles, état des services.
export async function getContainerReport(code) {
  const response = await apiClient.get(`/containers/${encodeURIComponent(code)}/report`);
  return response.data;
}

export async function getContainerProofs(code, limit = 20) {
  const response = await apiClient.get(`/proofs/container/${encodeURIComponent(code)}`, {
    params: { limit },
  });
  return response.data;
}

export async function getSystemStatus() {
  const response = await apiClient.get('/system/status');
  return response.data;
}

export async function getAlerts(filters = {}) {
  const response = await apiClient.get('/alerts', { params: filters });
  return response.data;
}

export async function getAlertStats() {
  const response = await apiClient.get('/alerts/stats');
  return response.data;
}

export async function runAlertCheck() {
  const response = await apiClient.post('/alerts/check');
  return response.data;
}

export async function resolveAlert(id) {
  const response = await apiClient.post(`/alerts/${encodeURIComponent(id)}/resolve`);
  return response.data;
}

export async function ignoreAlert(id) {
  const response = await apiClient.post(`/alerts/${encodeURIComponent(id)}/ignore`);
  return response.data;
}

// --- Phase 4 : notifications multi-canal ---
export async function getOutboundNotifications(filters = {}) {
  const response = await apiClient.get('/notifications', { params: filters });
  return response.data;
}

export async function getOutboundNotificationStats() {
  const response = await apiClient.get('/notifications/stats');
  return response.data;
}

export async function retryNotification(id) {
  const response = await apiClient.post(`/notifications/${encodeURIComponent(id)}/retry`);
  return response.data;
}

export async function getNotificationSettings() {
  const response = await apiClient.get('/notification-settings');
  return response.data;
}

export async function updateNotificationSettings(payload) {
  const response = await apiClient.put('/notification-settings', payload);
  return response.data;
}

export async function sendAlertNotification(alertId) {
  const response = await apiClient.post(`/alerts/${encodeURIComponent(alertId)}/notify`);
  return response.data;
}

// --- Phase 6 : sécurité (MFA, utilisateurs, rôles, audit) ---

export async function mfaSetup() {
  const response = await apiClient.post('/auth/mfa/setup');
  return response.data;
}

export async function mfaEnable(code) {
  const response = await apiClient.post('/auth/mfa/enable', { code });
  return response.data;
}

export async function mfaDisable({ code, password }) {
  const response = await apiClient.post('/auth/mfa/disable', { code, password });
  return response.data;
}

export async function resetUserMfa(userId) {
  const response = await apiClient.post(`/users/${encodeURIComponent(userId)}/reset-mfa`);
  return response.data;
}

export async function getUsers() {
  const response = await apiClient.get('/users');
  return response.data;
}

export async function getUser(id) {
  const response = await apiClient.get(`/users/${encodeURIComponent(id)}`);
  return response.data;
}

export async function createUser(payload) {
  const response = await apiClient.post('/users', payload);
  return response.data;
}

export async function updateUser(id, payload) {
  const response = await apiClient.put(`/users/${encodeURIComponent(id)}`, payload);
  return response.data;
}

export async function deactivateUser(id) {
  const response = await apiClient.delete(`/users/${encodeURIComponent(id)}`);
  return response.data;
}

export async function setUserRoles(id, roles) {
  const response = await apiClient.put(`/users/${encodeURIComponent(id)}/roles`, { roles });
  return response.data;
}

export async function getRoles() {
  const response = await apiClient.get('/roles');
  return response.data;
}

export async function getPermissions() {
  const response = await apiClient.get('/permissions');
  return response.data;
}

export async function setRolePermissions(id, permissions) {
  const response = await apiClient.put(`/roles/${encodeURIComponent(id)}/permissions`, { permissions });
  return response.data;
}

export async function getAuditLogs(filters = {}) {
  const response = await apiClient.get('/audit-logs', { params: filters });
  return response.data;
}

export async function getAuditStats() {
  const response = await apiClient.get('/audit-logs/stats');
  return response.data;
}

export async function changePassword(payload) {
  const response = await apiClient.post('/auth/password/change', payload);
  return response.data;
}

export async function changePasswordForced(payload) {
  const response = await apiClient.post('/auth/change-password', payload);
  return response.data;
}

export async function getSessions() {
  const response = await apiClient.get('/auth/sessions');
  return response.data;
}

export async function revokeSession(id) {
  const response = await apiClient.delete(`/auth/sessions/${id}`);
  return response.data;
}

export async function getSettings() {
  const response = await apiClient.get('/settings');
  return response.data;
}

export async function updateSettings(payload) {
  const response = await apiClient.patch('/settings', payload);
  return response.data;
}

export async function createCamera(payload) {
  const response = await apiClient.post('/cameras', payload);
  return response.data;
}

export async function updateCamera(id, payload) {
  const response = await apiClient.patch(`/cameras/${encodeURIComponent(id)}`, payload);
  return response.data;
}

export async function deleteCamera(id) {
  const response = await apiClient.delete(`/cameras/${encodeURIComponent(id)}`);
  return response.data;
}

export async function testCamera(id, payload = {}) {
  const response = await apiClient.post(`/cameras/${encodeURIComponent(id)}/test`, payload);
  return response.data;
}

export async function reviewDetection(payload) {
  const response = await apiClient.post('/detections/review', payload);
  return response.data;
}
