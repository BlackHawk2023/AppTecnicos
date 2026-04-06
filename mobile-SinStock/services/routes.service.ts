import api from './api.service';

export interface RutaResumen {
    id: number;
    estado: string;
    total_servicios: number;
    servicios_completados: number;
    servicios_pendientes: number;
    progreso_porcentaje: number;
}

export interface RutaEstadoResponse {
    tiene_ruta_activa: boolean;
    ruta: RutaResumen | null;
    ultima_ruta: any | null;
}

export interface RutaDetalle {
    ruta: RutaResumen;
    servicios: any[];
    resumen: any;
    estadisticas_tecnico: any;
}

export const RoutesService = {
    getEstadoRuta: async (): Promise<RutaEstadoResponse> => {
        try {
            const response = await api.get('/mobile/rutas/estado');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching route state', error);
            throw error;
        }
    },

    getRutaDetalle: async (rutaId: number) => {
        try {
            const response = await api.get(`/mobile/rutas/${rutaId}`);
            return response.data.data;
        } catch (error) {
            console.error('Error fetching route detail', error);
            throw error;
        }
    },

    getSuggestedRoute: async (rutaId: number, lat: number, lon: number, perfil: string = 'car') => {
        try {
            const response = await api.post(`/mobile/rutas/${rutaId}/recorrido-sugerido`, {
                latitud: lat,
                longitud: lon,
                perfil: perfil
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching suggested route', error);
            throw error;
        }
    }
};
