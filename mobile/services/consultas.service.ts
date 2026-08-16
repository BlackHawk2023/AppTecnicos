import api from './api.service';

export interface GestionPreviaInfo {
    tipo_gestion?: string | null;
    tecnico_nombre?: string | null;
    fecha_gestion?: string | null;
    nombre?: string | null;   // nombre del cliente
    dni?: string | null;      // DNI del cliente
    material_entregado?: any[] | null;
    material_retirado?: any[] | null;
}

export interface ServicioInfo {
    cita: string;
    ot: string;
    partida: number;
    tipo_incidente?: string | null;
    fecha_cierre?: string | null;
    estado?: string | null;
    subestado?: string | null;
    motivo_cierre?: string | null;
    sub_motivo_cierre?: string | null;
    observaciones_cierre?: string | null;
    recurso?: string | null;
    terminal?: string | null;
    denominacion?: string | null;
    gestion?: GestionPreviaInfo | null;
}

export interface ConsultaServiciosParams {
    terminal?: string;
    cuit?: string;
    ot?: string;
    cita?: string;
    limit?: number;
    /** Si true, ignora el tope estándar (20) y devuelve el historial completo */
    completo?: boolean;
}

export const ConsultasService = {
    /**
     * Consulta informativa de servicios (historial por terminal / búsqueda por cuit/ot/cita).
     * Requiere al menos un filtro. No modifica datos.
     */
    consultarServicios: async (params: ConsultaServiciosParams): Promise<ServicioInfo[]> => {
        try {
            const response = await api.get('/mobile/servicios/consulta', { params });
            return response.data.data as ServicioInfo[];
        } catch (error) {
            console.error('Error consultando servicios', error);
            throw error;
        }
    },
};
