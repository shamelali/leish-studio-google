import { useStore } from './store';
import { authApi } from './api';
import type { User } from '../types';

export function useAuth() {
  const { currentUser, token, setCurrentUser, setToken, logout } = useStore();

  const login = async (email: string, password: string) => {
    const response = await authApi.login({ email, password });
    setCurrentUser(response.user, response.token);
    return response;
  };

  const register = async (data: { name: string; email: string; password: string; role?: string; phone?: string; salonId?: string; bio?: string }) => {
    const response = await authApi.register(data);
    setCurrentUser(response.user, response.token);
    return response;
  };

  const signOut = () => {
    logout();
  };

  const updateProfile = async (data: { id: string; name?: string; phone?: string; bio?: string; avatar?: string }) => {
    const response = await authApi.updateProfile(data);
    setCurrentUser(response.user);
    return response;
  };

  return {
    user: currentUser,
    token,
    isAuthenticated: !!currentUser,
    login,
    register,
    signOut,
    updateProfile,
  };
}
