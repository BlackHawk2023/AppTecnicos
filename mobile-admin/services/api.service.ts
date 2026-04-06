/**
 * Servicio API - Cliente HTTP para comunicación con backend
 * Configurado para trabajar 100% online (sin caché local)
 */
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getToken, getRefreshToken, saveToken, clearAuthData, getServerUrl } from '../utils/storage';

// Instancia de Axios
let apiClient: AxiosInstance | null = null;

/**
 * Crear cliente API con la URL del servidor
 */
export async function createApiClient(): Promise<AxiosInstance> {
  const serverUrl = await getServerUrl();

  if (!serverUrl) {
    throw new Error('URL del servidor no configurada');
  }

  const normalizedUrl = serverUrl.replace(/\/+$/, '');

  apiClient = axios.create({
    baseURL: `${normalizedUrl}/api/v1`,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Interceptor para agregar token a las peticiones
  apiClient.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      const token = await getToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Interceptor para manejar errores de respuesta
  apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      // Si es error 401 y no hemos reintentado aún
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          // Intentar refrescar el token
          const refreshToken = await getRefreshToken();
          if (refreshToken) {
            const response = await axios.post(`${serverUrl}/api/v1/auth/refresh`, {
              refresh_token: refreshToken,
            });

            const newToken = response.data.access_token;
            await saveToken(newToken);

            // Reintentar la petición original
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            return axios(originalRequest);
          }
        } catch (refreshError) {
          // Error al refrescar, limpiar datos y redirigir a login
          await clearAuthData();
          // La navegación se manejará desde el AuthContext
          return Promise.reject(refreshError);
        }
      }

      return Promise.reject(error);
    }
  );

  return apiClient;
}

/**
 * Obtener cliente API existente o crear uno nuevo
 */
export async function getApiClient(): Promise<AxiosInstance> {
  if (!apiClient) {
    return createApiClient();
  }
  return apiClient;
}

/**
 * Resetear cliente API (al cerrar sesión)
 */
export function resetApiClient(): void {
  apiClient = null;
}

/**
 * Verificar conexión con el servidor
 */
export async function checkServerConnection(url: string): Promise<boolean> {
  const normalizedUrl = url.replace(/\/+$/, '');
  try {
    const response = await axios.get(`${normalizedUrl}/health`, { timeout: 10000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Manejar errores de API de forma consistente
 */
export function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      // El servidor respondió con un error
      const data = error.response.data as any;
      return data?.detail || data?.message || `Error ${error.response.status}`;
    } else if (error.request) {
      // No se recibió respuesta
      return 'No se pudo conectar con el servidor. Verifica tu conexión.';
    }
  }
  return error instanceof Error ? error.message : 'Error desconocido';
}

export default {
  createApiClient,
  getApiClient,
  resetApiClient,
  checkServerConnection,
  handleApiError,
};
