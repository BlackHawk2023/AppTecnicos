/**
 * Servicio de Alertas de Stock
 * Maneja alertas de stock contra el backend StDiscarV2
 *
 * Endpoints usados:
 *   GET  /stock-discar/alertas            → Listar alertas
 *   GET  /stock-discar/alertas/count      → Conteo de alertas pendientes
 *   GET  /stock-discar/alertas/{id}       → Detalle de alerta
 *   POST /stock-discar/alertas/{id}/resolver → Resolver alerta
 *
 * NOTA: No existe "severidad" ni "marcarComoVista" en el backend.
 *       Las alertas tienen tipo (SERIE_DUPLICADA, STOCK_NEGATIVO) y resuelta (bool).
 */
import { getApiClient } from './api.service';

// ==================== INTERFACES ====================

export interface Alerta {
  id: number;
  tipo: string;                     // 'SERIE_DUPLICADA' | 'STOCK_NEGATIVO'
  codigo_material: string;
  serie: string | null;
  codigo_base: string | null;
  descripcion: string;
  tecnico_id: string | null;
  tecnico_nombre: string | null;
  orden_servicio: string | null;
  datos_adicionales: string | null; // JSON string
  resuelta: boolean;
  resuelta_por: string | null;
  fecha_resolucion: string | null;
  comentario_resolucion: string | null;
  fecha_creacion: string;
}

export interface AlertasResponse {
  total: number;
  alertas: Alerta[];               // ⚠️ El backend usa "alertas", NO "items"
}

export interface AlertasCount {
  total: number;
  por_tipo: Record<string, number>;
}

export interface AlertaFilters {
  resuelta?: boolean;              // default false
  tipo?: string;                   // 'SERIE_DUPLICADA' | 'STOCK_NEGATIVO'
  tecnico_id?: string;
  skip?: number;
  limit?: number;
}

// ==================== FUNCIONES ====================

/**
 * Listar alertas con filtros
 */
export async function getAlertas(filters: AlertaFilters = {}): Promise<AlertasResponse> {
  const client = await getApiClient();

  const params = new URLSearchParams();
  if (filters.resuelta !== undefined) params.append('resuelta', filters.resuelta.toString());
  if (filters.tipo) params.append('tipo', filters.tipo);
  if (filters.tecnico_id) params.append('tecnico_id', filters.tecnico_id);
  params.append('skip', (filters.skip ?? 0).toString());
  params.append('limit', (filters.limit ?? 50).toString());

  const response = await client.get<AlertasResponse>(`/stock-discar/alertas?${params.toString()}`);
  return response.data;
}

/**
 * Obtener conteo de alertas pendientes por tipo
 */
export async function getAlertasCount(): Promise<AlertasCount> {
  const client = await getApiClient();
  const response = await client.get<AlertasCount>('/stock-discar/alertas/count');
  return response.data;
}

/**
 * Obtener detalle de una alerta
 */
export async function getAlerta(id: number): Promise<Alerta> {
  const client = await getApiClient();
  const response = await client.get<Alerta>(`/stock-discar/alertas/${id}`);
  return response.data;
}

/**
 * Resolver una alerta
 */
export async function resolverAlerta(id: number, comentario?: string): Promise<any> {
  const client = await getApiClient();
  const response = await client.post(`/stock-discar/alertas/${id}/resolver`, {
    comentario: comentario || undefined,
  });
  return response.data;
}
