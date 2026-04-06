/**
 * Utilidades de almacenamiento seguro
 * Usa expo-secure-store para datos sensibles como tokens
 */
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user_data';
const SERVER_URL_KEY = 'server_url';
const CODIGO_BASE_KEY = 'codigo_base';

/**
 * Guardar token de autenticación
 */
export async function saveToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (error) {
    console.error('Error guardando token:', error);
    throw error;
  }
}

/**
 * Obtener token de autenticación
 */
export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error('Error obteniendo token:', error);
    return null;
  }
}

/**
 * Guardar refresh token
 */
export async function saveRefreshToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  } catch (error) {
    console.error('Error guardando refresh token:', error);
    throw error;
  }
}

/**
 * Obtener refresh token
 */
export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('Error obteniendo refresh token:', error);
    return null;
  }
}

/**
 * Guardar datos del usuario
 */
export async function saveUserData(user: any): Promise<void> {
  try {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  } catch (error) {
    console.error('Error guardando datos de usuario:', error);
    throw error;
  }
}

/**
 * Obtener datos del usuario
 */
export async function getUserData(): Promise<any | null> {
  try {
    const data = await SecureStore.getItemAsync(USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error obteniendo datos de usuario:', error);
    return null;
  }
}

/**
 * Guardar URL del servidor
 */
export async function saveServerUrl(url: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(SERVER_URL_KEY, url);
  } catch (error) {
    console.error('Error guardando URL del servidor:', error);
    throw error;
  }
}

/**
 * Obtener URL del servidor
 */
export async function getServerUrl(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SERVER_URL_KEY);
  } catch (error) {
    console.error('Error obteniendo URL del servidor:', error);
    return null;
  }
}

/**
 * Alias para getServerUrl (compatibilidad)
 */
export const getStoredServerUrl = getServerUrl;

/**
 * Guardar código base del encargado
 */
export async function saveCodigoBase(codigoBase: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(CODIGO_BASE_KEY, codigoBase);
  } catch (error) {
    console.error('Error guardando código base:', error);
    throw error;
  }
}

/**
 * Obtener código base del encargado
 */
export async function getCodigoBase(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CODIGO_BASE_KEY);
  } catch (error) {
    console.error('Error obteniendo código base:', error);
    return null;
  }
}

/**
 * Limpiar todos los datos de autenticación
 */
export async function clearAuthData(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    await SecureStore.deleteItemAsync(CODIGO_BASE_KEY);
    // No borramos la URL del servidor para conveniencia
  } catch (error) {
    console.error('Error limpiando datos de autenticación:', error);
    throw error;
  }
}

/**
 * Limpiar todos los datos (incluyendo URL)
 */
export async function clearAllData(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    await SecureStore.deleteItemAsync(SERVER_URL_KEY);
    await SecureStore.deleteItemAsync(CODIGO_BASE_KEY);
  } catch (error) {
    console.error('Error limpiando todos los datos:', error);
    throw error;
  }
}
