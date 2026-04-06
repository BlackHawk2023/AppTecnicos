import { getApiClient, handleApiError } from './api.service';

/**
 * Interfaces basadas en el frontend web para mantener compatibilidad
 */
export interface DespachoItem {
    id: number;
    codigo_material: string;
    serie: string | null;
    cantidad: number;
    stock_discar_id: number | null;
    stock_estado?: string | null;
}

export interface DespachoCaja {
    id: number;
    numero: number;
    estado: 'ABIERTA' | 'CERRADA';
    fecha_creacion: string;
    fecha_cierre: string | null;
    items: DespachoItem[];
    total_items: number;
}

export interface MaterialResumen {
    codigo_material: string;
    descripcion: string;
    cantidad_total: number;
    cantidad_cajas: number;
    cajas: number[];
}

export interface Despacho {
    id: number;
    almacen_id: string;
    estado: 'EN_PROGRESO' | 'SOLICITADO' | 'CERRADO' | 'CANCELADO';
    numero_remito: string | null;
    tiene_foto_remito: boolean;
    observaciones: string | null;
    fecha_creacion: string;
    fecha_solicitud: string | null;
    fecha_cierre: string | null;
    creado_por: string | null;
    cajas: DespachoCaja[];
    total_cajas: number;
    cajas_abiertas: number;
    resumen_materiales: MaterialResumen[];
    total_items: number;
}

export interface DespachoListItem {
    id: number;
    almacen_id: string;
    estado: string;
    numero_remito: string | null;
    fecha_creacion: string;
    total_cajas: number;
    cajas_abiertas: number;
}

export interface GetDespachosParams {
    almacen_id?: string;
    estado?: string;
    limit?: number;
    offset?: number;
}

export async function getDespachos(params?: GetDespachosParams): Promise<DespachoListItem[]> {
    try {
        const api = await getApiClient();
        const response = await api.get('/stock-discar/despachos', { params });
        return response.data;
    } catch (error) {
        throw new Error(handleApiError(error));
    }
}

export async function getDespachoDetalle(id: number): Promise<Despacho> {
    try {
        const api = await getApiClient();
        const response = await api.get(`/stock-discar/despachos/${id}`);
        return response.data;
    } catch (error) {
        throw new Error(handleApiError(error));
    }
}

// Cajas
export async function createCaja(despachoId: number): Promise<DespachoCaja> {
    try {
        const api = await getApiClient();
        const response = await api.post(`/stock-discar/despachos/${despachoId}/cajas`);
        return response.data;
    } catch (error) {
        throw new Error(handleApiError(error));
    }
}

export async function updateCajaEstado(despachoId: number, cajaId: number, estado: 'ABIERTA' | 'CERRADA'): Promise<DespachoCaja> {
    try {
        const api = await getApiClient();
        const response = await api.put(`/stock-discar/despachos/${despachoId}/cajas/${cajaId}`, { estado });
        return response.data;
    } catch (error) {
        throw new Error(handleApiError(error));
    }
}

// NOTE: Delete Caja es riesgoso, si lo implementamos es con precaución
export async function deleteCaja(despachoId: number, cajaId: number): Promise<void> {
    try {
        const api = await getApiClient();
        await api.delete(`/stock-discar/despachos/${despachoId}/cajas/${cajaId}`);
    } catch (error) {
        throw new Error(handleApiError(error));
    }
}

// Items
export interface AddDespachoItemPayload {
    codigo_material: string;
    serie: string | null;
    cantidad: number;
}

export async function addItemToCaja(despachoId: number, cajaId: number, payload: AddDespachoItemPayload): Promise<DespachoItem> {
    try {
        const api = await getApiClient();
        const response = await api.post(`/stock-discar/despachos/${despachoId}/cajas/${cajaId}/items`, payload);
        return response.data;
    } catch (error) {
        throw new Error(handleApiError(error));
    }
}

export async function removeItemFromCaja(despachoId: number, cajaId: number, itemId: number): Promise<void> {
    try {
        const api = await getApiClient();
        await api.delete(`/stock-discar/despachos/${despachoId}/cajas/${cajaId}/items/${itemId}`);
    } catch (error) {
        throw new Error(handleApiError(error));
    }
}

// Validate Caja (Confirma los items pendientes)
export async function validateCaja(despachoId: number, cajaId: number): Promise<void> {
    try {
        const api = await getApiClient();
        await api.post(`/stock-discar/despachos/${despachoId}/cajas/${cajaId}/validar`);
    } catch (error) {
        throw new Error(handleApiError(error));
    }
}

export default {
    getDespachos,
    getDespachoDetalle,
    createCaja,
    updateCajaEstado,
    deleteCaja,
    addItemToCaja,
    removeItemFromCaja,
    validateCaja,
};
