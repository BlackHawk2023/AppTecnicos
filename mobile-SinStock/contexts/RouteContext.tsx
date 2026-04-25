import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { RoutesService, RutaResumen, RutaDetalle } from '../services/routes.service';
import { useAuth } from './AuthContext';
import { locationService } from '../services/location.service';

// Generated order info
interface GeneratedOrder {
    filePath: string;
    generatedAt: Date;
    tipoCierre: string;
    latitude?: number;
    longitude?: number;
}

// Reported novedad info
interface ReportedNovedad {
    note: string;
    imagePath: string;
    latitude?: number | null;
    longitude?: number | null;
    reportedAt: Date;
}

interface RouteContextType {
    rutaActiva: RutaResumen | null;
    servicios: any[];
    loading: boolean;
    refreshing: boolean;
    hasRoute: boolean;
    generatedOrders: Map<string, GeneratedOrder>;
    reportedNovedades: Map<string, ReportedNovedad>;
    fetchRouteData: () => Promise<void>;
    syncWithBackend: () => Promise<void>;  // For pull-to-refresh
    getServiceById: (cita: string, ot: string, partida: number) => any | undefined;
    getServicesByOT: (cita: string, ot: string) => any[];
    updateServiceLocalStatus: (cita: string, ot: string, partida: number, newStatus: string) => void;
    setGeneratedOrder: (cita: string, ot: string, partida: number, orderInfo: GeneratedOrder) => void;
    getGeneratedOrder: (cita: string, ot: string, partida: number) => GeneratedOrder | undefined;
    setReportedNovedad: (cita: string, ot: string, partida: number, novedadInfo: ReportedNovedad) => void;
    getReportedNovedad: (cita: string, ot: string, partida: number) => ReportedNovedad | undefined;
    isServiceCompleted: (cita: string, ot: string, partida: number) => boolean;
    finalizarRuta: () => Promise<void>;
}

const RouteContext = createContext<RouteContextType>({
    rutaActiva: null,
    servicios: [],
    loading: false,
    refreshing: false,
    hasRoute: false,
    generatedOrders: new Map(),
    reportedNovedades: new Map(),
    fetchRouteData: async () => { },
    syncWithBackend: async () => { },
    getServiceById: () => undefined,
    getServicesByOT: () => [],
    updateServiceLocalStatus: () => { },
    setGeneratedOrder: () => { },
    getGeneratedOrder: () => undefined,
    setReportedNovedad: () => { },
    getReportedNovedad: () => undefined,
    isServiceCompleted: () => false,
    finalizarRuta: async () => { },
});

export const useRoute = () => useContext(RouteContext);

// Helper to create unique service key
const getServiceKey = (cita: string, ot: string, partida: number) => `${cita}-${ot}-${partida}`;

export const RouteProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const [rutaActiva, setRutaActiva] = useState<RutaResumen | null>(null);
    const [servicios, setServicios] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [hasRoute, setHasRoute] = useState(false);
    const [generatedOrders, setGeneratedOrders] = useState<Map<string, GeneratedOrder>>(new Map());
    const [reportedNovedades, setReportedNovedades] = useState<Map<string, ReportedNovedad>>(new Map());

    // Load route data from LOCAL SQLite only (no network calls)
    // This is called on app startup - works fully offline
    const fetchRouteData = useCallback(async () => {
        console.log('RouteContext: fetchRouteData called (local only). User present:', !!user);
        if (!user) {
            console.log('RouteContext: Aborting because user is null/undefined');
            setLoading(false);
            return;
        }

        try {
            console.log('RouteContext: Loading from local SQLite...');
            const { createDatabaseService } = await import('../db/database');
            const db = createDatabaseService();
            await db.init();

            // Load cached route from SQLite
            const rutaLocal = await db.getRutaActiva();

            if (rutaLocal) {
                console.log(`RouteContext: Found cached ruta ${rutaLocal.ruta.id}`);
                setRutaActiva(rutaLocal.ruta);
                setHasRoute(true);

                // Start background tracking for existing route
                locationService.startTracking(rutaLocal.ruta.id);

                // Load cached services
                const serviciosLocal = await db.getServiciosRuta(rutaLocal.ruta.id);
                setServicios(serviciosLocal);
                console.log(`RouteContext: Loaded ${serviciosLocal.length} servicios from cache`);

                // Load gestiones for current route to restore "Ya gestionada" state
                const gestiones = await db.getGestionesByRuta(rutaLocal.ruta.id);
                const ordersMap = new Map<string, GeneratedOrder>();
                const novedadesMap = new Map<string, ReportedNovedad>();

                for (const g of gestiones) {
                    const key = getServiceKey(g.cita, g.ot, g.partida);

                    if (g.tipo === 'ORDEN') {
                        ordersMap.set(key, {
                            filePath: g.order_image_path || '',
                            generatedAt: new Date(g.timestamp),
                            tipoCierre: g.tipo_cierre || '',
                            latitude: g.latitude || undefined,
                            longitude: g.longitude || undefined
                        });
                    } else if (g.tipo === 'NOVEDAD') {
                        novedadesMap.set(key, {
                            note: g.nota_novedad || '',
                            imagePath: g.novedad_image_path || '',
                            reportedAt: new Date(g.timestamp),
                            latitude: g.latitude || undefined,
                            longitude: g.longitude || undefined
                        });
                    }
                }

                setGeneratedOrders(ordersMap);
                setReportedNovedades(novedadesMap);
                console.log(`RouteContext: Restored ${ordersMap.size} orders and ${novedadesMap.size} novedades from local DB`);
            } else {
                console.log('RouteContext: No cached route found');
                setRutaActiva(null);
                setServicios([]);
                setHasRoute(false);
                setGeneratedOrders(new Map());
                setReportedNovedades(new Map());
            }
        } catch (error) {
            console.error('RouteContext: Error loading local data:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    // Sync with backend - called by pull-to-refresh (manual sync)
    // Unified sync logic for both Home and Stock screens
    // correct order: Upload (Movements -> Gestiones -> Locations) -> Finalize -> Download -> Cleanup
    const syncWithBackend = useCallback(async () => {
        console.log('RouteContext: syncWithBackend called (manual sync)');
        if (!user) return;

        setRefreshing(true);

        // Track sync results for feedback
        let uploadSuccess = true;
        let downloadSuccess = true;
        let gestionesSynced = 0;

        try {
            const { createDatabaseService } = await import('../db/database');
            const db = createDatabaseService();
            await db.init();

            // Dynamics import to avoid cycles
            const { syncService } = await import('../services/sync.service');
            const { default: api } = await import('../services/api.service');

            // ═══════════════════════════════════════════════════════════════
            // FASE 1: UPLOAD — Subir TODO lo pendiente antes de cualquier otra cosa
            // ═══════════════════════════════════════════════════════════════

            // 1.1 Subir gestiones pendientes (órdenes + novedades)
            try {
                const pendingGestiones = await db.getPendingGestiones();
                if (pendingGestiones.length > 0) {
                    console.log(`RouteContext: Uploading ${pendingGestiones.length} gestiones...`);
                    // Note: syncPendingOrders now gets ruta_id from local DB, so it works even if offline/finalizing
                    const result = await syncService.syncPendingOrders();
                    if (result.success) {
                        gestionesSynced = pendingGestiones.length;
                    } else {
                        uploadSuccess = false;
                    }
                }
            } catch (gestionesError) {
                console.error('RouteContext: Gestiones upload failed:', gestionesError);
                uploadSuccess = false;
            }

            // 1.2 Subir ubicaciones pendientes
            try {
                await locationService.syncPendingLocations();
            } catch (locError) {
                console.log('RouteContext: Location upload failed:', locError);
                // Non-critical
            }

            // ═══════════════════════════════════════════════════════════════
            // FASE 2: FINALIZACION — Solo después de haber subido TODO
            // ═══════════════════════════════════════════════════════════════

            // Check for locally FINALIZED route pending backend confirmation
            // CRITICAL: Read from DB to avoid React State closure staleness
            const localRuta = await db.getRutaActiva();

            if (localRuta && localRuta.ruta && localRuta.ruta.estado === 'FINALIZADA') {
                console.log('RouteContext: Found locally finalized route (in DB). Syncing to backend...');
                const idToFinalize = localRuta.ruta.id;
                try {
                    // Call Backend to finalize
                    await api.post(`/mobile/rutas/${idToFinalize}/finalizar`);
                    console.log('RouteContext: Backend finalization successful.');

                    // Now we can safely clear local data
                    await db.clearRutaActiva();
                    await db.clearGestionesNotInRuta(null);

                    // Update state to null so the rest of the function sees "No Route"
                    // and fetches the new status correctly
                    setRutaActiva(null);
                    setServicios([]);
                    setGeneratedOrders(new Map());
                    setReportedNovedades(new Map());
                    setHasRoute(false);

                    // Note: We don't return here. We let the function continue to "Download updated route status"
                } catch (finalizeError) {
                    console.error('RouteContext: Backend finalization failed:', finalizeError);
                    Alert.alert('Error', 'No se pudo finalizar la ruta en el servidor. Se reintentará en la próxima sincronización.');
                    // We stop here to keep the local state as FINALIZADA so user can try again
                    setRefreshing(false);
                    return;
                }
            }

            // ═══════════════════════════════════════════════════════════════
            // FASE 3: DOWNLOAD — Descargar datos actualizados del backend
            // ═══════════════════════════════════════════════════════════════

            // 3.0 Actualizar metadata (plantillas, materiales, tipos de cierre)
            try {
                console.log('RouteContext: Refreshing metadata (plantillas, materials)...');
                await syncService.syncMetadata();
                console.log('RouteContext: Metadata refresh complete.');
            } catch (metaError) {
                console.log('RouteContext: Metadata refresh failed (non-critical):', metaError);
            }

            // 3.1 Bajar estado de ruta
            const statusData = await RoutesService.getEstadoRuta();
            const hasRemoteRuta = statusData.tiene_ruta_activa && !!statusData.ruta;

            // HANDLE ROUTE TRANSITIONS (5 SCENARIOS)
            let newRuta = null;

            // SCENARIO 1: Old route active -> New route from backend (Different ID)
            if (rutaActiva && hasRemoteRuta && statusData.ruta && statusData.ruta.id !== rutaActiva.id) {
                console.log('RouteContext: Route changed! Clearing old, setting new.');
                await db.clearRutaActiva();
                // Don't save yet - wait for details
                // Also clear gestiones from old route
                await db.clearGestionesNotInRuta(statusData.ruta.id);
                newRuta = statusData.ruta;
            }
            // SCENARIO 2: Same route active -> Update details
            else if (rutaActiva && hasRemoteRuta && statusData.ruta && statusData.ruta.id === rutaActiva.id) {
                console.log('RouteContext: Updating existing route details.');
                // Don't save yet - wait for details
                newRuta = statusData.ruta;
            }
            // SCENARIO 3: No local route -> No remote route (Idle)
            else if (!rutaActiva && !hasRemoteRuta) {
                console.log('RouteContext: No active route.');
                // Ensure UI is clear
                setRutaActiva(null);
                setServicios([]);
                setHasRoute(false);
            }
            // SCENARIO 4: No local route -> Remote route exists (New login or recovery)
            else if (!rutaActiva && hasRemoteRuta && statusData.ruta) {
                console.log('RouteContext: Found new route from backend.');
                // Don't save yet - wait for details
                newRuta = statusData.ruta;
            }
            // SCENARIO 5: Local route active -> Remote says NO route (Post-finalization or cancellation)
            else if (rutaActiva && !hasRemoteRuta) {
                console.log('RouteContext: Local route exists but backend has none.');
                // If our local route is NOT finalized, it might be a cancellation from backend
                if (rutaActiva.estado !== 'FINALIZADA') {
                    Alert.alert(
                        'Ruta cancelada',
                        'La ruta ha sido cerrada o cancelada desde la central.'
                    );
                    await db.clearRutaActiva();
                    await db.clearGestionesNotInRuta(null);
                    if (typeof db.clearSyncedGestiones === 'function') {
                        await db.clearSyncedGestiones();
                        console.log('RouteContext: Cleaned synced gestiones on route cancellation');
                    }
                    setRutaActiva(null);
                    setServicios([]);
                    setHasRoute(false);
                } else {
                    // If local is finalized, we should have handled it in FASE 2.
                    // But if we are here, it means we might have missed the transition.
                    // Just clear it.
                    console.log('RouteContext: Cleaning up finalized route.');
                    await db.clearRutaActiva();
                    await db.clearGestionesNotInRuta(null);
                    if (typeof db.clearSyncedGestiones === 'function') {
                        await db.clearSyncedGestiones();
                        console.log('RouteContext: Cleaned synced gestiones for finalized route');
                    }
                    setRutaActiva(null);
                    setServicios([]);
                    setHasRoute(false);
                }
            }

            // If we have a new/updated route, fetch details and save
            if (newRuta) {
                console.log('RouteContext: Fetching details for route:', newRuta.id);
                try {
                    const detailData = await RoutesService.getRutaDetalle(newRuta.id);
                    if (detailData && detailData.servicios) {
                        // Save route and services
                        await db.saveRutaActiva(newRuta, detailData.servicios);
                        console.log(`RouteContext: Saved route ${newRuta.id} with ${detailData.servicios.length} services.`);

                        // NEW: Register RECEPCION location if this is a new assignment (Scenario 1 or 4)
                        // Verify if we didn't have a route before OR if the ID changed
                        const isNewAssignment = !rutaActiva || (rutaActiva.id !== newRuta.id);

                        if (isNewAssignment) {
                            console.log('RouteContext: Registering RECEPCION location for new/changed route...');
                            // Fire and forget - don't block saving
                            locationService.registerLocation(newRuta.id, 'RECEPCION').catch(err => {
                                console.error('RouteContext: Error registering RECEPCION location:', err);
                            });
                        }
                    }
                } catch (error) {
                    console.error('RouteContext: Error fetching/saving route details:', error);
                }

                // Refresh context state from DB
                await fetchRouteData();
            }

            // Stop tracking since we're done with the potential route change logic/tracking
            if (!hasRemoteRuta) {
                locationService.stopTracking();
            }

            // 3.2 Bajar notificaciones para la app (dinámicas por condición de servicio)
            try {
                console.log('RouteContext: Downloading app notifications...');
                const { default: api } = await import('../services/api.service');
                const notifResponse = await api.get('/novedades/app/notificaciones');
                const notificaciones = notifResponse?.data?.notificaciones;
                if (notificaciones && Array.isArray(notificaciones)) {
                    await db.saveAppNotificaciones(notificaciones);
                    console.log(`RouteContext: Saved ${notificaciones.length} app notifications`);
                }
            } catch (notifError) {
                console.log('RouteContext: App notifications download failed (non-critical):', notifError);
                // Non-critical — don't mark downloadSuccess as false
            }

            // ═══════════════════════════════════════════════════════════════
            // FASE 4: CLEANUP — Limpiar datos sincronizados de la DB local
            // ═══════════════════════════════════════════════════════════════

            // Cleanup is now handled only when the route changes or finishes
            // Keeping them here allows gestiones to stay visible while route is active
            console.log('RouteContext: Phase 4 Cleanup complete (gestiones preserved for active route).');

            // Show success feedback to user
            if (uploadSuccess && downloadSuccess) {
                let message = '✓ Sincronización completada correctamente.';
                if (gestionesSynced > 0) {
                    const parts = [];
                    if (gestionesSynced > 0) {
                        parts.push(`${gestionesSynced} ${gestionesSynced === 1 ? 'servicio registrado' : 'servicios registrados'}`);
                    }
                    message = `✓ Sincronización exitosa.\n\nSe subieron: ${parts.join(', ')}.`;
                }
                Alert.alert('Sincronización Completa', message);
            }

        } catch (error) {
            console.error('RouteContext: Sync with backend failed:', error);
            Alert.alert('Error de sincronización', 'No se pudo conectar al servidor. Los datos locales se mantienen.');
            // Don't clear local data on sync failure - keep working offline
        } finally {
            setRefreshing(false);
        }
    }, [user, rutaActiva]);

    // Initial load when user changes (login/session restore)
    // If no local data exists, automatically sync with backend
    useEffect(() => {
        if (user) {
            const loadAndMaybeSyncData = async () => {
                // First, try to load local data
                await fetchRouteData();

                // If no local route exists, trigger sync (fresh login or post-logout)
                // Small delay to ensure fetchRouteData has completed and set hasRoute
                setTimeout(async () => {
                    const { createDatabaseService } = await import('../db/database');
                    const db = createDatabaseService();
                    await db.init();
                    const rutaLocal = await db.getRutaActiva();

                    if (!rutaLocal) {
                        console.log('RouteContext: No local route found, triggering initial sync...');
                        syncWithBackend();
                    }
                }, 100);
            };

            loadAndMaybeSyncData();
        }
    }, [user]);

    const getServiceById = (cita: string, ot: string, partida: number) => {
        console.log(`RouteContext: Looking for service. Params: Cita=${cita} OT=${ot} Partida=${partida}`);
        return servicios.find(s => {
            const match = s.cita == cita && s.ot == ot && s.partida == partida;
            if (match) console.log('RouteContext: Service FOUND:', s.denominacion);
            return match;
        });
    };

    // Get all services with the same OT/cita (all partidas)
    const getServicesByOT = (cita: string, ot: string) => {
        return servicios.filter(s => s.cita == cita && s.ot == ot);
    };

    // Update local status (not synced to backend - internal use only)
    const updateServiceLocalStatus = (cita: string, ot: string, partida: number, newStatus: string) => {
        setServicios(prev => prev.map(s => {
            if (s.cita == cita && s.ot == ot && s.partida == partida) {
                console.log(`RouteContext: Updating service ${s.ot} local status to: ${newStatus}`);
                return { ...s, estado_local: newStatus };
            }
            return s;
        }));
    };

    // Store generated order info (also clears any novedad for this service)
    const setGeneratedOrder = (cita: string, ot: string, partida: number, orderInfo: GeneratedOrder) => {
        const key = getServiceKey(cita, ot, partida);

        // Set the order
        setGeneratedOrders(prev => {
            const newMap = new Map(prev);
            newMap.set(key, orderInfo);
            console.log(`RouteContext: Stored generated order for ${key}`);
            return newMap;
        });

        // Clear any existing novedad (a service can only have order OR novedad)
        setReportedNovedades(prev => {
            const newMap = new Map(prev);
            newMap.delete(key);
            return newMap;
        });

        // Also update local status
        updateServiceLocalStatus(cita, ot, partida, 'Lista');

        // Track location for ORDEN event
        if (rutaActiva) {
            locationService.registerLocation(rutaActiva.id, 'ORDEN');
        }
    };

    // Get generated order by service ID
    const getGeneratedOrder = (cita: string, ot: string, partida: number) => {
        const key = getServiceKey(cita, ot, partida);
        return generatedOrders.get(key);
    };

    // Store reported novedad info (also clears any order for this service)
    const setReportedNovedad = (cita: string, ot: string, partida: number, novedadInfo: ReportedNovedad) => {
        const key = getServiceKey(cita, ot, partida);

        // Set the novedad
        setReportedNovedades(prev => {
            const newMap = new Map(prev);
            newMap.set(key, novedadInfo);
            console.log(`RouteContext: Stored reported novedad for ${key}`);
            return newMap;
        });

        // Clear any existing order (a service can only have order OR novedad)
        setGeneratedOrders(prev => {
            const newMap = new Map(prev);
            newMap.delete(key);
            return newMap;
        });

        // Also update local status
        updateServiceLocalStatus(cita, ot, partida, 'Novedad');

        // Track location for REPORTE event
        if (rutaActiva) {
            locationService.registerLocation(rutaActiva.id, 'REPORTE');
        }
    };

    // Get reported novedad by service ID
    const getReportedNovedad = (cita: string, ot: string, partida: number) => {
        const key = getServiceKey(cita, ot, partida);
        return reportedNovedades.get(key);
    };

    // Check if a service is completed (has order OR novedad)
    const isServiceCompleted = (cita: string, ot: string, partida: number): boolean => {
        const key = getServiceKey(cita, ot, partida);
        return generatedOrders.has(key) || reportedNovedades.has(key);
    };

    // Finalizar la ruta actual
    const finalizarRuta = async () => {
        if (!rutaActiva) return;

        try {
            setLoading(true);
            const { createDatabaseService } = await import('../db/database');
            const db = createDatabaseService();
            await db.init();

            // 1. Register FINALIZACION location (Silent - Sync triggers later)
            await locationService.registerLocation(rutaActiva.id, 'FINALIZACION', { skipSync: true });

            // 2. Stop Tracking
            await locationService.stopTracking();

            // 3. Mark locally as FINALIZADA (Do not delete yet)
            const updatedRuta = { ...rutaActiva, estado: 'FINALIZADA' };
            await db.saveRutaActiva(updatedRuta, servicios);
            setRutaActiva(updatedRuta);

            console.log('RouteContext: Ruta marcada como FINALIZADA localmente.');
            // Note: Sync will now detect this state and upload it.
            // Note: Sync should be called by the UI after this returns

        } catch (error: any) {
            console.error('RouteContext: Error finalizing route:', error);
            Alert.alert('Error', error.response?.data?.detail || 'No se pudo finalizar la ruta.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <RouteContext.Provider value={{
            rutaActiva,
            servicios,
            loading,
            refreshing,
            hasRoute,
            generatedOrders,
            reportedNovedades,
            fetchRouteData,
            syncWithBackend,
            getServiceById,
            getServicesByOT,
            updateServiceLocalStatus,
            setGeneratedOrder,
            getGeneratedOrder,
            setReportedNovedad,
            getReportedNovedad,
            isServiceCompleted,
            finalizarRuta,
        }}>
            {children}
        </RouteContext.Provider>
    );
};
