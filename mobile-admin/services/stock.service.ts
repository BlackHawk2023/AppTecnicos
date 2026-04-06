/**
 * Servicio de Stock Discar
 * Maneja operaciones CRUD de stock contra el backend StDiscarV2
 *
 * Todos los endpoints usan el prefijo /stock-discar/
 */
import { getApiClient } from './api.service';

// ==================== INTERFACES ====================

export interface StockItem {
  id: number;
  codigo_material: string;
  nombre_material: string;
  unidad_medida: string;        // 'SERIALIZADO' | 'UNIDAD'
  categoria: string | null;
  codigo_base: string;
  nombre_base: string;
  ubicacion_id: number;
  ubicacion_codigo: string;
  ubicacion_nombre: string;
  serie: string | null;
  cantidad: number;
  estado: string;               // 'DISPONIBLE' | 'EN_TRANSFERENCIA' | 'CONFLICTO'
  fecha_creacion: string;
  fecha_modificacion: string;
  condicion: string;
  observaciones: string | null;
}

export interface StockCreateData {
  codigo_material: string;
  codigo_base: string;
  ubicacion_id: number;
  serie: string | null;
  cantidad: number;
  estado?: string;
  observaciones?: string;
}

export interface StockDashboard {
  total_items: number;
  items_serializados: number;
  items_unidad: number;
  total_cantidad: number;
  por_base: Record<string, number>;
  por_ubicacion: Record<string, number>;
  por_categoria: Record<string, number>;
}

export interface Ubicacion {
  id: number;
  codigo: string;
  nombre: string;
  tipo: string;                   // 'FIJA' | 'TECNICO' | 'DEPOSITO'
  tecnico_id: string | null;
  tecnico_nombre: string | null;
  activo: boolean;
}

export interface ValidarSerieResult {
  disponible: boolean;
  mensaje: string;
  ubicacion_actual?: {
    base: string;
    ubicacion_id: number;
  };
}

export interface StockFilters {
  codigo_base?: string;
  ubicacion_id?: number;
  busqueda?: string;
  estado?: string;
  serie?: string;
  codigo_material?: string;
  skip?: number;
  limit?: number;
}

export interface Material {
  codigo_material: string;
  nombre: string;
  unidad_medida: string;        // 'SERIALIZADO' | 'UNIDAD'
  categoria?: string;
}

export interface MovimientoTecnico {
  id: number;
  tecnico_id: string;
  tecnico_nombre: string | null;
  codigo_material: string;
  nombre_material: string;
  unidad_medida: string;
  serie: string | null;
  cantidad: number;
  tipo_movimiento: string;
  codigo_base: string;
  cita: string | null;
  ot: string | null;
  partida: number | null;
  caja: string | null;
  fecha_hora: string;
  observaciones: string | null;
}

// --- Auditoría interna interfaces ---
export interface ItemAuditoriaEncontrado {
  codigo_base: string;
  codigo_material: string;
  nombre_material: string;
  unidad_medida: string;
  serie: string | null;
  cantidad: number;
  ubicacion: string;
  condicion: string;
}

export interface ItemAuditoriaNoVerificado {
  codigo_base: string;
  codigo_material: string;
  nombre_material: string;
  unidad_medida: string;
  serie: string | null;
  cantidad: number;
  ubicacion: string;
  condicion: string;
}

export interface ItemAuditoriaNoEnStock {
  codigo_base: string;
  codigo_material: string;
  nombre_material: string;
  unidad_medida: string;
  serie: string | null;
  cantidad: number;
  ubicacion: string | null;
  condicion: string;
}

export interface AuditoriaInternaPayload {
  codigo_base: string;
  items_encontrados: ItemAuditoriaEncontrado[];
  items_no_verificados: ItemAuditoriaNoVerificado[];
  items_no_en_stock: ItemAuditoriaNoEnStock[];
}

export interface AuditoriaInternaResponse {
  id: number;
  codigo_base: string;
  nombre_base: string | null;
  fecha_auditoria: string;
  usuario_auditor: string;
  nombre_auditor: string | null;
  total_items: number;
  items_encontrados: number;
  items_no_verificados: number;
  items_no_en_stock: number;
  porcentaje_precision: number;
  nombre_archivo: string;
  created_at: string;
}

// ==================== FUNCIONES ====================

/**
 * Obtener listado de stock con filtros
 */
export async function getStock(filters: StockFilters = {}): Promise<StockItem[]> {
  const client = await getApiClient();

  const params = new URLSearchParams();
  if (filters.codigo_base) params.append('codigo_base', filters.codigo_base);
  if (filters.ubicacion_id) params.append('ubicacion_id', filters.ubicacion_id.toString());
  if (filters.busqueda) params.append('busqueda', filters.busqueda);
  if (filters.estado) params.append('estado', filters.estado);
  if (filters.serie) params.append('serie', filters.serie);
  if (filters.codigo_material) params.append('codigo_material', filters.codigo_material);
  params.append('skip', (filters.skip ?? 0).toString());
  params.append('limit', (filters.limit ?? 100).toString());

  const response = await client.get<StockItem[]>(`/stock-discar/stock?${params.toString()}`);
  return response.data;
}

/**
 * Obtener un item de stock por ID
 */
export async function getStockItem(id: number): Promise<StockItem> {
  const client = await getApiClient();
  const response = await client.get<StockItem>(`/stock-discar/stock/${id}`);
  return response.data;
}

/**
 * Crear nueva entrada de stock
 */
export async function crearEntradaStock(data: StockCreateData): Promise<any> {
  const client = await getApiClient();
  const response = await client.post('/stock-discar/stock', data);
  return response.data;
}

/**
 * Obtener dashboard de stock
 */
export async function getDashboard(codigoBase?: string): Promise<StockDashboard> {
  const client = await getApiClient();
  const params = codigoBase ? `?codigo_base=${codigoBase}` : '';
  const response = await client.get<StockDashboard>(`/stock-discar/dashboard${params}`);
  return response.data;
}

/**
 * Obtener ubicaciones disponibles
 */
export async function getUbicaciones(filters?: { tipo?: string; activo?: boolean }): Promise<Ubicacion[]> {
  const client = await getApiClient();

  const params = new URLSearchParams();
  if (filters?.tipo) params.append('tipo', filters.tipo);
  if (filters?.activo !== undefined) params.append('activo', filters.activo.toString());

  const response = await client.get<Ubicacion[]>(`/stock-discar/ubicaciones?${params.toString()}`);
  return response.data;
}

/**
 * Validar si un número de serie está disponible
 * NOTA: Es GET, no POST. Requiere codigo_material además de serie.
 */
export async function validarSerie(codigoMaterial: string, serie: string): Promise<ValidarSerieResult> {
  const client = await getApiClient();
  const params = new URLSearchParams();
  params.append('codigo_material', codigoMaterial);
  params.append('serie', serie);
  const response = await client.get<ValidarSerieResult>(`/stock-discar/validar-serie?${params.toString()}`);
  return response.data;
}

/**
 * Obtener materiales disponibles
 * Extrae materiales únicos del stock actual (no hay endpoint dedicado para encargados)
 */
export async function getMateriales(codigoBase?: string): Promise<Material[]> {
  const stockItems = await getStock({ codigo_base: codigoBase, limit: 500 });

  // Extraer materiales únicos
  const materialesMap = new Map<string, Material>();
  for (const item of stockItems) {
    if (!materialesMap.has(item.codigo_material)) {
      materialesMap.set(item.codigo_material, {
        codigo_material: item.codigo_material,
        nombre: item.nombre_material,
        unidad_medida: item.unidad_medida,
        categoria: item.categoria ?? undefined,
      });
    }
  }

  return Array.from(materialesMap.values());
}

/**
 * Cambiar la condición de una unidad de stock
 */
export async function changeStockCondition(id: number, condicion: string, cantidad?: number, ubicacion_destino_id?: number, observaciones?: string): Promise<any> {
  const client = await getApiClient();
  const response = await client.post(`/stock-discar/stock/${id}/cambiar-condicion`, {
    condicion,
    cantidad,
    ubicacion_destino_id,
    observaciones
  });
  return response.data;
}

/**
 * Obtener movimientos de técnico
 */
export async function getMovimientos(filters: { serie?: string, limit?: number } = {}): Promise<{ items: MovimientoTecnico[], total: number }> {
  const client = await getApiClient();
  const params = new URLSearchParams();
  if (filters.serie) params.append('serie', filters.serie);
  if (filters.limit) params.append('limit', filters.limit.toString());

  const response = await client.get(`/mobile/stock/movimientos?${params.toString()}`);
  return response.data;
}

// ---------------- Auditoría Interna ----------------

export async function finalizarAuditoria(payload: AuditoriaInternaPayload): Promise<AuditoriaInternaResponse> {
  const client = await getApiClient();
  const response = await client.post<AuditoriaInternaResponse>('/stock-discar/auditoria/finalizar', payload);
  return response.data;
}

// ---------------- Auditoría Colaborativa ----------------

export interface AuditoriaColaborativaListItem {
  id: number;
  codigo_base: string;
  nombre_base: string | null;
  estado: string;
  total_items_sistema: number;
  items_auditados: number;
  items_encontrados: number;
  items_no_en_stock: number;
  porcentaje_avance: number;
  creado_por: string;
  nombre_creador: string | null;
  created_at: string;
}

export interface AuditoriaColaborativaProgreso {
  total_items_sistema: number;
  items_auditados: number;
  items_encontrados: number;
  items_no_en_stock: number;
  porcentaje_avance: number;
  items: AuditoriaColaborativaItemOut[];
  stock_items_confirmados: number[];
}

export interface AuditoriaColaborativaItemOut {
  id: number;
  auditoria_id: number;
  stock_item_id: number | null;
  codigo_material: string;
  nombre_material: string;
  unidad_medida: string;
  serie: string | null;
  cantidad_sistema: number;
  cantidad_fisica: number | null;
  ubicacion: string | null;
  condicion: string;
  tipo: string; // 'ENCONTRADO' | 'NO_EN_STOCK'
  auditado_por: string;
  nombre_auditor: string | null;
  auditado_at: string;
}

/**
 * Obtener auditorías colaborativas activas para el usuario
 */
export async function getAuditoriasColaborativas(estado?: string): Promise<AuditoriaColaborativaListItem[]> {
  const client = await getApiClient();
  const params = estado ? `?estado=${estado}` : '';
  const response = await client.get<AuditoriaColaborativaListItem[]>(`/stock-discar/auditoria-colaborativa/activas${params}`);
  return response.data;
}

/**
 * Obtener el progreso actual de una auditoría
 */
export async function getProgresoAuditoria(auditoriaId: number): Promise<AuditoriaColaborativaProgreso> {
  const client = await getApiClient();
  const response = await client.get<AuditoriaColaborativaProgreso>(`/stock-discar/auditoria-colaborativa/${auditoriaId}/progreso`);
  return response.data;
}

/**
 * Confirmar que un ítem del stock fue encontrado
 */
export async function confirmarItemAuditoria(
  auditoriaId: number,
  stockItemId: number,
  cantidadFisica?: number,
  condicion?: string
): Promise<AuditoriaColaborativaItemOut> {
  const client = await getApiClient();
  const response = await client.post<AuditoriaColaborativaItemOut>(
    `/stock-discar/auditoria-colaborativa/${auditoriaId}/confirmar-item`,
    { stock_item_id: stockItemId, cantidad_fisica: cantidadFisica, condicion }
  );
  return response.data;
}

/**
 * Registrar un ítem encontrado que no está en el sistema
 */
export async function registrarItemNoEnStock(
  auditoriaId: number,
  item: {
    codigo_material: string;
    nombre_material: string;
    unidad_medida: string;
    serie?: string;
    cantidad?: number;
    ubicacion?: string;
    condicion?: string;
  }
): Promise<AuditoriaColaborativaItemOut> {
  const client = await getApiClient();
  const response = await client.post<AuditoriaColaborativaItemOut>(
    `/stock-discar/auditoria-colaborativa/${auditoriaId}/item-no-en-stock`,
    item
  );
  return response.data;
}

/**
 * Deshacer la confirmación de un ítem
 */
export async function eliminarItemAuditoria(auditoriaId: number, itemId: number): Promise<void> {
  const client = await getApiClient();
  await client.delete(`/stock-discar/auditoria-colaborativa/${auditoriaId}/item/${itemId}`);
}

