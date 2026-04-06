/**
 * Contexto de Autenticación
 * Maneja el estado de autenticación global de la app
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { router } from 'expo-router';
import { login as authLogin, getCurrentUser, getBaseDelUsuario, User } from '../services/auth.service';
import { createApiClient, resetApiClient } from '../services/api.service';
import {
  saveToken,
  saveRefreshToken,
  saveUserData,
  getToken,
  getUserData,
  clearAuthData,
  getServerUrl,
} from '../utils/storage';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  codigoBase: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [codigoBase, setCodigoBase] = useState<string | null>(null);

  // Verificar estado de autenticación al montar
  useEffect(() => {
    checkAuth();
  }, []);

  /**
   * Verificar si hay una sesión activa
   */
  const checkAuth = async () => {
    try {
      setIsLoading(true);
      const serverUrl = await getServerUrl();
      if (!serverUrl) {
        setIsAuthenticated(false);
        setUser(null);
        return;
      }

      const token = await getToken();
      if (!token) {
        setIsAuthenticated(false);
        setUser(null);
        return;
      }

      // Intentar recrear el cliente API y verificar el token
      await createApiClient();

      try {
        // Validar token llamando a /auth/me
        const userData = await getCurrentUser();
        setUser(userData);
        setIsAuthenticated(true);

        // Obtener código de base
        if (userData.zona) {
          const baseInfo = await getBaseDelUsuario(userData.zona);
          if (baseInfo) {
            setCodigoBase(baseInfo.codigo);
            // Actualizar user con info de base
            setUser(prev => prev ? { ...prev, codigoBase: baseInfo.codigo, nombreBase: baseInfo.nombre } : null);
          }
        }
      } catch (error) {
        // Token inválido o expirado
        console.log('Token inválido, limpiando sesión');
        await clearAuthData();
        resetApiClient();
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (error) {
      console.error('Error en checkAuth:', error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Login del encargado
   */
  const login = async (username: string, password: string) => {
    try {
      // 1. Autenticarse
      const loginResult = await authLogin(username, password);

      // 2. Guardar tokens
      await saveToken(loginResult.access_token);
      await saveRefreshToken(loginResult.refresh_token);

      // 3. Recrear cliente API con el token
      await createApiClient();

      // 4. Obtener datos del usuario
      const userData = await getCurrentUser();

      // 5. Obtener código de base
      let baseCode: string | null = null;
      let baseName: string | null = null;
      if (userData.zona) {
        const baseInfo = await getBaseDelUsuario(userData.zona);
        if (baseInfo) {
          baseCode = baseInfo.codigo;
          baseName = baseInfo.nombre;
        }
      }

      // 6. Enriquecer user con datos de base
      const enrichedUser: User = {
        ...userData,
        codigoBase: baseCode ?? undefined,
        nombreBase: baseName ?? undefined,
      };

      // 7. Guardar usuario en storage y state
      await saveUserData(enrichedUser);
      setUser(enrichedUser);
      setCodigoBase(baseCode);
      setIsAuthenticated(true);

      // 8. Navegar a tabs
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error en login:', error);
      throw error;
    }
  };

  /**
   * Cerrar sesión
   */
  const logout = async () => {
    await clearAuthData();
    resetApiClient();
    setUser(null);
    setCodigoBase(null);
    setIsAuthenticated(false);
    router.replace('/(auth)/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        codigoBase,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
