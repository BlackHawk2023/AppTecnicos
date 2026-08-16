/**
 * Servicio de Autenticación
 * Maneja login, logout y datos del usuario contra el backend StDiscarV2
 *
 * Endpoints usados:
 *   POST /mobile/auth/login → {usuario, password} → {access_token, refresh_token, token_type, tecnico}
 *   GET  /auth/me         → Bearer token → datos del usuario
 *   GET  /zonas           → para obtener la base del encargado
 */
import { getApiClient } from './api.service';

// ==================== INTERFACES ====================

export interface LoginRequest {
  usuario: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  usuario: string;
  nombrecompleto: string;
  perfil: string;
  zona: string;
  is_active: boolean;
  email?: string | null;
  // Campos derivados (se obtienen después del login)
  codigoBase?: string;      // código de almacén/base (ej: "DI02")
  nombreBase?: string;       // nombre descriptivo de la base
}

export interface ZonaInfo {
  zona: string;
  descripcion: string;
  base: string;
}

// ==================== FUNCIONES ====================

/**
 * Login del encargado
 * Usa el endpoint general /auth/login ya que los encargados no son técnicos.
 * Envía X-App-Id: stock-admin para que el backend valide acceso_app_stock
 * (independiente del acceso web).
 */
export async function login(usuario: string, password: string): Promise<LoginResponse> {
  const client = await getApiClient();
  const response = await client.post<LoginResponse>('/auth/login', {
    username: usuario,
    password,
  }, {
    headers: { 'X-App-Id': 'stock-admin' },
  });
  return response.data;
}

/**
 * Obtener datos del usuario autenticado
 */
export async function getCurrentUser(): Promise<User> {
  const client = await getApiClient();
  const response = await client.get('/auth/me');
  // Mapear la respuesta del endpoint al formato User
  return {
    usuario: response.data.usuario,
    nombrecompleto: response.data.nombrecompleto || response.data.nombre_completo,
    perfil: response.data.perfil,
    zona: response.data.zona,
    is_active: response.data.is_active,
    email: response.data.email,
  };
}

/**
 * Obtener info de zona para determinar la base del encargado
 */
export async function getZonas(): Promise<ZonaInfo[]> {
  const client = await getApiClient();
  const response = await client.get<ZonaInfo[]>('/zonas');
  return response.data;
}

/**
 * Obtener la base del encargado a partir de su zona
 */
export async function getBaseDelUsuario(zonaUsuario: string): Promise<{ codigo: string; nombre: string } | null> {
  try {
    const zonas = await getZonas();
    const zona = zonas.find(z => z.zona === zonaUsuario);
    if (zona) {
      return { codigo: zona.base, nombre: zona.descripcion };
    }
    return null;
  } catch (error) {
    console.warn('No se pudo obtener la base del usuario:', error);
    return null;
  }
}
