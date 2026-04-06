import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications'; // Import for permissions

import { dbService, UbicacionTracking } from '../db/database.native';
import api from './api.service';

const LOCATION_TASK_NAME = 'background-location-task';
const TRACKING_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

// Define task outside of class/component
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
    if (error) {
        console.error('LocationService: Background task error:', error);
        return;
    }
    if (data) {
        const { locations } = data;
        if (locations && locations.length > 0) {
            try {
                // Initialize DB connection
                await dbService.init();
                const activeRuta = await dbService.getRutaActiva();

                if (activeRuta && activeRuta.ruta) {
                    const rutaId = activeRuta.ruta.id;

                    // Process ALL locations in the batch
                    const promises = locations.map(async (location: any) => {
                        const ubicacion: UbicacionTracking = {
                            ruta_id: rutaId,
                            latitud: location.coords.latitude,
                            longitud: location.coords.longitude,
                            precision: location.coords.accuracy,
                            tipo_registro: 'AUTOMATICO',
                            fecha_hora: new Date(location.timestamp).toISOString()
                        };
                        return dbService.saveUbicacion(ubicacion);
                    });

                    await Promise.all(promises);
                    console.log(`LocationService: Saved batch of ${locations.length} background locations`);

                } else {
                    console.log('LocationService: Background locations received but no active route');
                }
            } catch (err) {
                console.error('LocationService: Error saving background locations:', err);
            }
        }
    }
});

class LocationService {
    private isTrackingActive = false;
    private foregroundInterval: NodeJS.Timeout | null = null;
    private currentRutaId: number | null = null;
    private isSyncing = false;



    async requestPermissions(): Promise<boolean> {
        try {
            const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
            if (fgStatus !== 'granted') {
                console.log('LocationService: Foreground permission denied');
                return false;
            }

            const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
            if (bgStatus !== 'granted') {
                console.log('LocationService: Background permission denied');
                // We can still run foreground tracking
            }

            // Android 13+ requires notification permission for the foreground service notification
            const { status: notifStatus } = await Notifications.requestPermissionsAsync();
            if (notifStatus !== 'granted') {
                console.log('LocationService: Notification permission denied');
            }

            return true;
        } catch (error) {
            console.error('LocationService: Error requesting permissions:', error);
            return false;
        }
    }

    async startTracking(rutaId: number) {
        if (this.isTrackingActive && this.currentRutaId === rutaId) return;

        console.log(`LocationService: Starting tracking (notifications only) for ruta ${rutaId}`);
        this.currentRutaId = rutaId;
        this.isTrackingActive = true;

        const hasPerms = await this.requestPermissions();
        if (!hasPerms) {
            console.log('LocationService: Permissions not granted, cannot start tracking');
            return;
        }

        // Clean up any existing background task from previous versions
        try {
            const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
            if (isRegistered) {
                await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
                console.log('LocationService: Cleaned up old background location updates');
            }
        } catch (e) { }

        // Muestra notificación persistente en lugar del foreground GPS service
        try {
            // First clear any existing to ensure we get a fresh one
            await Notifications.dismissNotificationAsync('active-route-notification');

            await Notifications.scheduleNotificationAsync({
                content: {
                    title: 'STDiscar - Ruta Activa',
                    body: 'Tiene una ruta activa, recuerde Sincronizar y Finalizar una vez Completada',
                    color: '#3498db',
                    sticky: true, // Android persistent notification
                },
                trigger: null, // Show immediately
                identifier: 'active-route-notification',
            });
            console.log('LocationService: Persistent notification scheduled');
        } catch (e) {
            console.error('LocationService: Error scheduling persistent notification:', e);
        }
    }

    async stopTracking() {
        console.log('LocationService: Stopping tracking');
        this.isTrackingActive = false;
        this.currentRutaId = null;

        // Limpiar notificación persistente
        try {
            await Notifications.dismissNotificationAsync('active-route-notification');
        } catch (e) {
            console.error('LocationService: Error dismissing notification:', e);
        }

        try {
            const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
            if (isRegistered) {
                await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
                console.log('LocationService: Background updates stopped');
            }
        } catch (e) {
            console.error('LocationService: Error stopping background updates:', e);
        }
    }

    async registerLocation(rutaId: number, tipoRegistro: 'RECEPCION' | 'AUTOMATICO' | 'ORDEN' | 'REPORTE' | 'FINALIZACION', options?: { skipSync?: boolean }) {
        try {
            // "Silencioso": no error alert if fails
            const { status } = await Location.getForegroundPermissionsAsync();
            if (status !== 'granted') return;

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Highest
            });

            const ubicacion: UbicacionTracking = {
                ruta_id: rutaId,
                latitud: location.coords.latitude,
                longitud: location.coords.longitude,
                precision: location.coords.accuracy,
                tipo_registro: tipoRegistro,
                fecha_hora: new Date().toISOString()
            };

            await dbService.saveUbicacion(ubicacion);
            console.log(`LocationService: Registered manual location (${tipoRegistro})`);

            // Try to sync immediately for important events (unless skipped)
            if (!options?.skipSync) {
                this.syncPendingLocations();
            }

        } catch (error) {
            console.error('LocationService: Error registering manual location:', error);
            // Save a record with null coordinates if it's a critical event?
            // The plan said "Si la ubicación ... está desactivada ... simplemente no se registrará".
            // So we do nothing.
            if (tipoRegistro !== 'AUTOMATICO') {
                // For events like ORDEN/FINALIZACION, maybe we want to record that it happened at least?
                // But the backend expects lat/long. 
                // We can send null lat/long as per model definition.
                try {
                    const ubicacion: UbicacionTracking = {
                        ruta_id: rutaId,
                        latitud: 0, // 0 usually means invalid/unknown in this context or use null if Interface allowed
                        longitud: 0,
                        precision: null,
                        tipo_registro: tipoRegistro,
                        fecha_hora: new Date().toISOString()
                    };
                    // But wait, latitud/longitud are number in interface, not null.
                    // Let's check interface.
                    // In database.native.ts I defined: latitud: number; longitud: number;
                    // But in backend I allowed nullable.
                    // Let's update interface to allow null if possible, or just skip saving if no location.
                    // Given the requirement "no molestar", skipping is safest.
                } catch (e) { }
            }
        }
    }

    async syncPendingLocations() {
        if (this.isSyncing) {
            console.log('LocationService: Sync already in progress, skipping.');
            return;
        }

        this.isSyncing = true;
        try {
            const pending = await dbService.getPendingUbicaciones();
            if (pending.length === 0) return;

            console.log(`LocationService: Syncing ${pending.length} pending locations`);

            // Transform to backend format
            const ubicacionesPayload = pending.map(u => ({
                latitud: u.latitud,
                longitud: u.longitud,
                precision: u.precision,
                tipo_registro: u.tipo_registro,
                fecha_hora: u.fecha_hora
            }));

            // Pending items belong to a ruta. We need to group by ruta_id if needed.
            // But usually we only have one active ruta tracking.
            // Check if multiple ruta_ids exist in pending?
            // Assuming for now they all belong to the current or last active route.
            // Better: sync by batch grouped by ruta_id

            const byRuta: Record<number, any[]> = {};
            pending.forEach(u => {
                if (!byRuta[u.ruta_id]) byRuta[u.ruta_id] = [];
                byRuta[u.ruta_id].push(u);
            });

            for (const rutaIdStr in byRuta) {
                const rutaId = parseInt(rutaIdStr);
                const items = byRuta[rutaId];

                const payload = {
                    ruta_id: rutaId,
                    ubicaciones: items.map(u => ({
                        latitud: u.latitud,
                        longitud: u.longitud,
                        precision: u.precision,
                        tipo_registro: u.tipo_registro,
                        fecha_hora: u.fecha_hora
                    }))
                };

                try {
                    await api.post('/mobile/rutas/ubicaciones', payload);

                    // Mark as synced
                    const ids = items.map(u => u.id as number);
                    await dbService.markUbicacionesSynced(ids);
                    console.log(`LocationService: Synced batch for ruta ${rutaId}`);
                } catch (err) {
                    console.error(`LocationService: Error syncing batch for ruta ${rutaId}:`, err);
                }
            }

        } catch (error) {
            console.error('LocationService: Error syncing locations:', error);
        } finally {
            this.isSyncing = false;
        }
    }

    async isTracking(): Promise<boolean> {
        return this.isTrackingActive;
    }

    async getCurrentLocationSilently(): Promise<{ lat: number, long: number } | null> {
        try {
            const { status } = await Location.getForegroundPermissionsAsync();
            if (status !== 'granted') return null;

            // Use getLastKnownPositionAsync for speed, or getCurrentPositionAsync with timeout
            const location = await Location.getLastKnownPositionAsync({});
            if (location) {
                return { lat: location.coords.latitude, long: location.coords.longitude };
            }

            const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            return { lat: current.coords.latitude, long: current.coords.longitude };
        } catch (e) {
            return null;
        }
    }
}

export const locationService = new LocationService();
