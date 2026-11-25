'use client';
import { useState, useEffect, useCallback } from 'react';
import { authApi } from '@/lib/api';
import { removeToken, getStoredToken } from '@/lib/auth';
import { User } from '@/types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const token = getStoredToken();
    if (!token) { setLoading(false); return; }
    
    authApi.me()
      .then(res => setUser(res.data.user))
      .catch(() => { removeToken(); })
      .finally(() => setLoading(false));
  }, []);
  
  const logout = useCallback(() => {
    removeToken();
    setUser(null);
    window.location.href = '/login';
  }, []);
  
  return { user, loading, logout };
}
