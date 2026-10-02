import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loginAdmin, verifyMfaLogin, getMe, logoutApi, changePasswordForced } from '../services/api';

const AuthContext = createContext(null);

function storeSession(data) {
  if (data.token) localStorage.setItem('marsa_token', data.token);
  if (data.refresh_token) localStorage.setItem('marsa_refresh_token', data.refresh_token);
}

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('marsa_token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await getMe();
      if (res.success) {
        setAdmin(res.data);
      } else {
        localStorage.removeItem('marsa_token');
        localStorage.removeItem('marsa_refresh_token');
      }
    } catch (err) {
      const msg = err.response?.data?.error || '';
      if (err.response?.status === 403 && /token invalide|expir/i.test(msg)) {
        localStorage.removeItem('marsa_token');
        localStorage.removeItem('marsa_refresh_token');
        window.location.href = '/login';
        return;
      }
      localStorage.removeItem('marsa_token');
      localStorage.removeItem('marsa_refresh_token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Retourne { success, mfa_required?, mfa_token?, error? }
  const login = async (email, password) => {
    const res = await loginAdmin(email, password);
    if (res.success && res.data?.password_change_required) {
      return {
        success: true,
        password_change_required: true,
        change_token: res.data.change_token,
        password_expired: res.data.password_expired,
        admin: res.data.admin,
      };
    }
    if (res.success && res.data?.mfa_required) {
      return { success: true, mfa_required: true, mfa_token: res.data.mfa_token };
    }
    if (res.success && res.data?.token) {
      storeSession(res.data);
      setAdmin({ ...res.data.admin, role_label: res.data.admin?.role_label });
    }
    return res;
  };

  const verifyMfa = async (mfaToken, code) => {
    const res = await verifyMfaLogin(mfaToken, code);
    if (res.success && res.data?.token) {
      storeSession(res.data);
      setAdmin({ ...res.data.admin, role_label: res.data.admin?.role_label });
    }
    return res;
  };

  const completePasswordChange = async (changeToken, newPassword, currentPassword) => {
    const res = await changePasswordForced({
      change_token: changeToken,
      new_password: newPassword,
      current_password: currentPassword,
    });
    if (res.success && res.data?.token) {
      storeSession(res.data);
      setAdmin({ ...res.data.admin, role_label: res.data.admin?.role_label });
    }
    return res;
  };

  const logout = async () => {
    await logoutApi();
    localStorage.removeItem('marsa_token');
    localStorage.removeItem('marsa_refresh_token');
    setAdmin(null);
  };

  // Recharge le profil (permissions à jour) après une action de sécurité.
  const refreshProfile = useCallback(async () => {
    try {
      const res = await getMe();
      if (res.success) setAdmin(res.data);
    } catch { /* ignore */ }
  }, []);

  const hasPermission = useCallback(
    (perm) => {
      if (!admin) return false;
      if (admin.is_super_admin || (admin.roles || []).includes('super_admin')) return true;
      if (!perm) return true;
      return (admin.permissions || []).includes(perm);
    },
    [admin]
  );

  return (
    <AuthContext.Provider
      value={{
        admin,
        loading,
        login,
        verifyMfa,
        completePasswordChange,
        logout,
        refreshProfile,
        hasPermission,
        isAuthenticated: !!admin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
