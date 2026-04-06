/**
 * Servicio de Transferencias
 * Maneja operaciones de transferencias de stock contra el backend StDiscarV2
 *
 * Endpoints usados:
 *   GET  /stock-discar/transferencias         → Listar transferencias
 *   GET  /stock-discar/transferencias/{id}    → Detalle de transferencia
 *   POST /stock-discar/transferencias         → Crear transferencia
 *   POST /stock-discar/transferencias/{id}/responder → Aceptar/rechazar
 *   POST /stock-discar/transferencias/{id}/cancelar  → Cancelar (¡es POST, no DELETE!)
 *   GET  /stock-discar/ubicaciones?tipo=FIJA  → Bases/depósitos
 *   GET  /usuarios                            → Lista de usuarios (filtrar técnicos)
 */
import { getApiClient } from './api.service';

// ==================== INTERFACES ====================

export interface TransferenciaItem {
  id: number;
  codigo_material: string;
  nombre_material?: string;
  serie: string | null;
  cantidad_solicitada: number;
  cantidad_aceptada: number | null;
  estado: string;
}

export interface Transferencia {
  id: number;
  origen_almacen_id: string;
  origen_ubicacion: string;
  origen_ubicacion_completa: string; // "DI01 - DEPOSITO"
  destino_almacen_id: string;
  destino_ubicacion: string;
  destino_ubicacion_completa: string; // "DI01 - DEPOSITO"
  estado: string;                 // PENDIENTE | ACEPTADA | RECHAZADA | CANCELADA
  comentario: string | null;
  fecha_creacion: string;
  creado_por: string | null;
  items: TransferenciaItem[];
}

export interface TransferenciasResponse {
  total: number;
  items: Transferencia[];
}

export interface CrearTransferenciaData {
  origen_almacen_id: string;      // (ej: "DI01")
  origen_ubicacion: string;       // código de ubicación (ej: "DEPOSITO")
  destino_almacen_id: string;     // (ej: "DI01")
  destino_ubicacion: string;      // código de ubicación (ej: "tecnico123")
  comentario?: string;
  items: {
    codigo_material: string;
    serie?: string;
    cantidad: number;
  }[];
}

export interface ResponderTransferenciaData {
  accion: 'aceptar' | 'rechazar';
  items?: { item_id: number; cantidad: number }[];
}

export interface Tecnico {
  usuario: string;
  nombrecompleto: string;
  perfil: string;
  zona: string | null;
  is_active: boolean;
}

export interface Base {
  id: number;
  codigo: string;
  nombre: string;
  tipo: string;
  activo: boolean;
}

export interface TransferenciaFilters {
  estado?: string;
  almacen_id?: string;
  ubicacion?: string;
  skip?: number;
  limit?: number;
}

// ==================== FUNCIONES ====================

/**
 * Listar transferencias con filtros
 */
export async function getTransferencias(filters: TransferenciaFilters = {}): Promise<TransferenciasResponse> {
  const client = await getApiClient();

  const params = new URLSearchParams();
  if (filters.estado) params.append('estado', filters.estado);
  if (filters.almacen_id) params.append('almacen_id', filters.almacen_id);
  if (filters.ubicacion) params.append('ubicacion', filters.ubicacion);
  params.append('skip', (filters.skip ?? 0).toString());
  params.append('limit', (filters.limit ?? 10000).toString());

  const response = await client.get<TransferenciasResponse>(`/stock-discar/transferencias?${params.toString()}`);
  return response.data;
}

/**
 * Obtener detalle de una transferencia
 */
export async function getTransferencia(id: number): Promise<Transferencia> {
  const client = await getApiClient();
  const response = await client.get<Transferencia>(`/stock-discar/transferencias/${id}`);
  return response.data;
}

/**
 * Crear nueva transferencia
 */
export async function crearTransferencia(data: CrearTransferenciaData): Promise<any> {
  const client = await getApiClient();
  const response = await client.post('/stock-discar/transferencias', data);
  return response.data;
}

/**
 * Responder a una transferencia (aceptar o rechazar)
 */
export async function responderTransferencia(id: number, data: ResponderTransferenciaData): Promise<any> {
  const client = await getApiClient();
  const response = await client.post(`/stock-discar/transferencias/${id}/responder`, data);
  return response.data;
}

/**
 * Cancelar una transferencia (POST, NO DELETE)
 */
export async function cancelarTransferencia(id: number, comentario?: string): Promise<any> {
  const client = await getApiClient();
  const response = await client.post(`/stock-discar/transferencias/${id}/cancelar`, {
    comentario: comentario || undefined,
  });
  return response.data;
}

/**
 * Validar si una transferencia es posible (verificación local)
 */
export function validarTransferencia(data: CrearTransferenciaData): { valid: boolean; error?: string } {
  if (!data.origen_almacen_id) return { valid: false, error: 'Falta almacén de origen' };
  if (!data.origen_ubicacion) return { valid: false, error: 'Falta ubicación de origen' };
  if (!data.destino_almacen_id) return { valid: false, error: 'Falta almacén de destino' };
  if (!data.destino_ubicacion) return { valid: false, error: 'Falta ubicación de destino' };
  if (!data.items || data.items.length === 0) return { valid: false, error: 'No hay items para transferir' };
  if (data.origen_almacen_id === data.destino_almacen_id && data.origen_ubicacion === data.destino_ubicacion) {
    return { valid: false, error: 'Origen y destino no pueden ser iguales' };
  }

  for (const item of data.items) {
    if (!item.codigo_material) return { valid: false, error: 'Item sin código de material' };
    if (item.cantidad <= 0) return { valid: false, error: 'Cantidad debe ser mayor a 0' };
  }

  return { valid: true };
}

/**
 * Obtener lista de técnicos (para selector de destino)
 */
export async function getTecnicos(): Promise<Tecnico[]> {
  const client = await getApiClient();
  const response = await client.get<Tecnico[]>('/usuarios');
  // Filtrar solo técnicos activos
  return response.data.filter(
    (u: any) => u.is_active && u.perfil?.toUpperCase() === 'TECNICO'
  );
}

/**
 * Obtener bases/depósitos (para selector de destino)
 */
export async function getBases(): Promise<Base[]> {
  const client = await getApiClient();
  const response = await client.get<Base[]>('/stock-discar/ubicaciones?tipo=FIJA&activo=true');
  return response.data;
}
