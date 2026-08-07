import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
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

// Applied stock-only info
interface AppliedStock {
    appliedAt: Date;
    latitude?: number | null;
    longitude?: number | null;
}

// Reported novedad info
interface ReportedNovedad {
    note: string;
    imagePath: string;
    latitude?: number | null;
    longitude?: number | null;
    reportedAt: Date;
}

// Reagendamiento info
interface ReagendamientoInfo {
    fecha_reagendada: string;    // YYYY-MM-DD
    turno_reagendamiento: string; // MAÑANA | SIESTA | TARDE
    nota: string;
    reagendadoAt: Date;
    latitude?: number | null;
    longitude?: number | null;
}

interface RouteContextType {
    rutaActiva: RutaResumen | null;
    servicios: any[];
    loading: boolean;
    refreshing: boolean;
    hasRoute: boolean;
    generatedOrders: Map<string, GeneratedOrder>;
    reportedNovedades: Map<string, ReportedNovedad>;
    appliedStocks: Map<string, AppliedStock>;
    reagendamientos: Map<string, ReagendamientoInfo>;
    fetchRouteData: () => Promise<void>;
    syncWithBackend: (options?: { silent?: boolean }) => Promise<void>;  // For pull-to-refresh and automatic retries
    getServiceById: (cita: string, ot: string, partida: number) => any | undefined;
    getServicesByOT: (cita: string, ot: string) => any[];
    updateServiceLocalStatus: (cita: string, ot: string, partida: number, newStatus: string) => void;
    setGeneratedOrder: (cita: string, ot: string, partida: number, orderInfo: GeneratedOrder) => void;
    getGeneratedOrder: (cita: string, ot: string, partida: number) => GeneratedOrder | undefined;
    setReportedNovedad: (cita: string, ot: string, partida: number, novedadInfo: ReportedNovedad) => void;
    getReportedNovedad: (cita: string, ot: string, partida: number) => ReportedNovedad | undefined;
    setAppliedStock: (cita: string, ot: string, partida: number, stockInfo: AppliedStock) => void;
    getAppliedStock: (cita: string, ot: string, partida: number) => AppliedStock | undefined;
    setReagendamiento: (cita: string, ot: string, partida: number, info: ReagendamientoInfo) => void;
    getReagendamiento: (cita: string, ot: string, partida: number) => ReagendamientoInfo | undefined;
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
    appliedStocks: new Map(),
    reagendamientos: new Map(),
    fetchRouteData: async () => { },
    syncWithBackend: async () => { },
    getServiceById: () => undefined,
    getServicesByOT: () => [],
    updateServiceLocalStatus: () => { },
    setGeneratedOrder: () => { },
    getGeneratedOrder: () => undefined,
    setReportedNovedad: () => { },
    getReportedNovedad: () => undefined,
    setAppliedStock: () => { },
    getAppliedStock: () => undefined,
    setReagendamiento: () => { },
    getReagendamiento: () => undefined,
    isServiceCompleted: () => false,
    finalizarRuta: async () => { },
});

export const useRoute = () => useContext(RouteContext);

// Helper to create unique service key
const getServiceKey = (cita: string, ot: string, partida: number) => `${cita}-${ot}-${partida}`;

export const RouteProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const [rutaActiva, setRutaActiva] = useState<RutaResumen | null>(null);
    const rutaActivaRef = useRef<RutaResumen | null>(null);
    const [servicios, setServicios] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [hasRoute, setHasRoute] = useState(false);
    const isSyncingRef = useRef(false);
    const [generatedOrders, setGeneratedOrders] = useState<Map<string, GeneratedOrder>>(new Map());
    const [reportedNovedades, setReportedNovedades] = useState<Map<string, ReportedNovedad>>(new Map());
    const [appliedStocks, setAppliedStocks] = useState<Map<string, AppliedStock>>(new Map());
    const [reagendamientos, setReagendamientos] = useState<Map<string, ReagendamientoInfo>>(new Map());

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
                rutaActivaRef.current = rutaLocal.ruta;
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
                const stocksMap = new Map<string, AppliedStock>();
                const reagMap = new Map<string, ReagendamientoInfo>();

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
                    } else if (g.tipo === 'STOCK') {
                        stocksMap.set(key, {
                            appliedAt: new Date(g.timestamp),
                            latitude: g.latitude || undefined,
                            longitude: g.longitude || undefined
                        });
                    } else if (g.tipo === 'REAGENDAMIENTO') {
                        // Last-wins: gestiones are ordered by created_at asc, so later entries overwrite
                        reagMap.set(key, {
                            fecha_reagendada: (g as any).fecha_reagendada || '',
                            turno_reagendamiento: (g as any).turno_reagendamiento || '',
                            nota: g.nota_novedad || '',
                            reagendadoAt: new Date(g.timestamp),
                            latitude: g.latitude || undefined,
                            longitude: g.longitude || undefined,
                        });
                    }
                }

                setGeneratedOrders(ordersMap);
                setReportedNovedades(novedadesMap);
                setAppliedStocks(stocksMap);
                setReagendamientos(reagMap);
                console.log(`RouteContext: Restored ${ordersMap.size} orders, ${novedadesMap.size} novedades, ${stocksMap.size} stocks, ${reagMap.size} reagendamientos from local DB`);
            } else {
                console.log('RouteContext: No cached route found');
                setRutaActiva(null);
                rutaActivaRef.current = null;
                setServicios([]);
                setHasRoute(false);
                setGeneratedOrders(new Map());
                setReportedNovedades(new Map());
                setAppliedStocks(new Map());
                setReagendamientos(new Map());
            }
        } catch (error) {
            console.error('RouteContext: Error loading local data:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    const cleanupRouteData = async (db: any) => {
        await db.clearRutaActiva();
        await db.clearAllGestiones();

        if (typeof db.clearPendingImageUploads === 'function') {
            await db.clearPendingImageUploads();
        }

        try {
            const FileSystem = await import('expo-file-system');
            const ordenesDir = `${FileSystem.documentDirectory}ordenes/`;
            const dirInfo = await FileSystem.getInfoAsync(ordenesDir);
            if (dirInfo.exists) {
                await FileSystem.deleteAsync(ordenesDir, { idempotent: true });
            }
        } catch (cleanupErr) {
            console.warn('RouteContext: Error cleaning image files:', cleanupErr);
        }
    };

    // Sync with backend - called by pull-to-refresh (manual sync)
    // Unified sync logic for both Home and Stock screens
    // correct order: Upload (Movements -> Gestiones -> Locations) -> Finalize -> Download -> Cleanup
    const syncWithBackend = useCallback(async (options?: { silent?: boolean }) => {
        console.log('RouteContext: syncWithBackend called (manual sync)');
        const silent = options?.silent === true;
        if (!user) return;
        if (isSyncingRef.current) {
            console.log('RouteContext: Sync already in progress, skipping duplicate call');
            return;
        }
        isSyncingRef.current = true;
        setRefreshing(true);

        // Track sync results for feedback
        let uploadSuccess = true;
        let downloadSuccess = true;
        let gestionesSynced = 0;
        let stockMovementsSynced = 0;
        // Hoist db reference so catch block can also write to sync_log
        let db: any = null;
        let syncErrorDetail: string | null = null;
        const syncStartTime = Date.now();

        try {
            const { createDatabaseService } = await import('../db/database');
            db = createDatabaseService();
            await db.init();
            const rutaLocalActual = await db.getRutaActiva();
            const currentRuta = rutaLocalActual?.ruta || rutaActivaRef.current;

            // Dynamics import to avoid cycles
            const { syncService } = await import('../services/sync.service');
            const { default: api } = await import('../services/api.service');

            // ═══════════════════════════════════════════════════════════════
            // FASE 1: UPLOAD — Subir TODO lo pendiente antes de cualquier otra cosa
            // ═══════════════════════════════════════════════════════════════

            // 1.1 Subir movimientos de stock pendientes (PRIMERO)
            // Razón: el backend necesita actualizar inventario ANTES de recibir
            // las gestiones que referencian esos materiales
            try {
                const pendingMovimientos = await db.getMovimientosPendientes();
                if (pendingMovimientos.length > 0) {
                    console.log(`RouteContext: Uploading ${pendingMovimientos.length} stock movements...`);
                    const result = await syncService.syncStockMovements();
                    if (result.success) {
                        stockMovementsSynced = pendingMovimientos.length;
                    } else {
                        // If stock movements fail, we should probably stop? 
                        // For now we continue but mark upload as failed
                        uploadSuccess = false;
                    }
                }
            } catch (stockErrors) {
                console.error('RouteContext: Stock movements upload failed:', stockErrors);
                uploadSuccess = false;
            }

            // 1.2 Subir gestiones pendientes (órdenes + novedades)
            // Razón: van después de movimientos porque referencian los materiales
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

            // 1.3 Subir ubicaciones pendientes
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
                    await cleanupRouteData(db);

                    // Update state to null so the rest of the function sees "No Route"
                    // and fetches the new status correctly
                    setRutaActiva(null);
                    setServicios([]);
                    setGeneratedOrders(new Map());
                    setReportedNovedades(new Map());
                    setReagendamientos(new Map());
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

            // 3.1 Bajar estado de ruta
            const statusData = await RoutesService.getEstadoRuta();
            const hasRemoteRuta = statusData.tiene_ruta_activa && !!statusData.ruta;

            // HANDLE ROUTE TRANSITIONS (5 SCENARIOS)
            let newRuta = null;

            // SCENARIO 1: Old route active -> New route from backend (Different ID)
            if (currentRuta && hasRemoteRuta && statusData.ruta && statusData.ruta.id !== currentRuta.id) {
                console.log('RouteContext: Route changed! Clearing old, setting new.');
                await cleanupRouteData(db);
                newRuta = statusData.ruta;
            }
            // SCENARIO 2: Same route active -> Update details
            else if (currentRuta && hasRemoteRuta && statusData.ruta && statusData.ruta.id === currentRuta.id) {
                console.log('RouteContext: Updating existing route details.');
                // Don't save yet - wait for details
                newRuta = statusData.ruta;
            }
            // SCENARIO 3: No local route -> No remote route (Idle)
            else if (!currentRuta && !hasRemoteRuta) {
                console.log('RouteContext: No active route.');
                // Ensure UI is clear
                setRutaActiva(null);
                setServicios([]);
                setHasRoute(false);
            }
            // SCENARIO 4: No local route -> Remote route exists (New login or recovery)
            else if (!currentRuta && hasRemoteRuta && statusData.ruta) {
                console.log('RouteContext: Found new route from backend.');
                // Don't save yet - wait for details
                newRuta = statusData.ruta;
            }
            // SCENARIO 5: Local route active -> Remote says NO route (Post-finalization or cancellation)
            else if (currentRuta && !hasRemoteRuta) {
                console.log('RouteContext: Local route exists but backend has none.');
                // If our local route is NOT finalized, it might be a cancellation from backend
                if (currentRuta.estado !== 'FINALIZADA') {
                    Alert.alert(
                        'Ruta cancelada',
                        'La ruta ha sido cerrada o cancelada desde la central.'
                    );
                    await cleanupRouteData(db);
                    setRutaActiva(null);
                    setServicios([]);
                    setHasRoute(false);
                } else {
                    // If local is finalized, we should have handled it in FASE 2.
                    // But if we are here, it means we might have missed the transition.
                    // Just clear it.
                    console.log('RouteContext: Cleaning up finalized route.');
                    await cleanupRouteData(db);
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
                        const isNewAssignment = !currentRuta || (currentRuta.id !== newRuta.id);

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

            // 3.0 Actualizar metadata (plantillas, materiales, tipos de cierre)
            // Se hace en cada sync para reflejar cambios administrativos sin necesidad de re-login
            try {
                console.log('RouteContext: Refreshing metadata (plantillas, materials)...');
                await syncService.syncMetadata();
                console.log('RouteContext: Metadata refresh complete.');
            } catch (metaError) {
                console.log('RouteContext: Metadata refresh failed (non-critical):', metaError);
                // Non-critical — metadata from previous sync remains valid
            }

            // 3.2 Bajar stock actualizado
            // IMPORTANT: Only overwrite local stock if the upload phase succeeded.
            // If movements failed to upload, the backend stock does not yet reflect
            // the technician's local operations. Overwriting would cause the delivered
            // serials to reappear as available until the next successful sync.
            if (!uploadSuccess) {
                console.log('RouteContext: Skipping stock download — upload phase had failures. Local stock preserved.');
                downloadSuccess = false;
            } else {
                try {
                    console.log('RouteContext: Downloading stock from backend...');
                    const stockItems = await syncService.getMiStockDiscar();
                    console.log('RouteContext: getMiStockDiscar returned:',
                        stockItems === null ? 'NULL' :
                            stockItems === undefined ? 'UNDEFINED' :
                                `Array(${Array.isArray(stockItems) ? stockItems.length : 'NOT_ARRAY'})`
                    );
                    if (stockItems && stockItems.length > 0) {
                        console.log('RouteContext: First stock item from backend:', JSON.stringify(stockItems[0]));
                    }
                    if (stockItems && Array.isArray(stockItems)) {
                        // Map backend data to local schema (handling missing fields and dates)
                        const mappedStock = stockItems.map((item: any) => ({
                            codigo_material: item.codigo_material,
                            nombre_material: item.nombre_material || item.codigo_material,
                            unidad_medida: item.unidad_medida || (item.serie ? 'SERIALIZADO' : 'UNIDAD'),
                            serie: item.serie || null,
                            cantidad: item.cantidad || 0,
                            fecha_asignacion: item.fecha_asignacion || new Date().toISOString(),
                            condicion: item.condicion || 'BUENO',
                            ubicacion_codigo: item.ubicacion_codigo || null
                        }));

                        console.log(`RouteContext: Mapped ${mappedStock.length} stock items. Saving to DB...`);
                        await db.saveStockLocal(mappedStock);
                        console.log(`RouteContext: saveStockLocal completed. Verifying...`);

                        // Verify the save worked
                        const verification = await db.getStockLocal();
                        console.log(`RouteContext: Verification - ${verification.length} items in DB after save`);
                    }
                } catch (stockError) {
                    console.log('RouteContext: Stock download failed:', stockError);
                    downloadSuccess = false;
                }
            }

            // 3.3 Bajar transferencias pendientes
            try {
                console.log('RouteContext: Downloading pending transfers...');
                const transfers = await syncService.getTransferenciasPendientes();
                if (transfers && Array.isArray(transfers) && typeof db.saveTransferenciasPendientes === 'function') {
                    await db.saveTransferenciasPendientes(transfers);
                    console.log(`RouteContext: Saved ${transfers.length} pending transfers to local`);
                }
            } catch (transferError) {
                console.log('RouteContext: Transfers download failed:', transferError);
                downloadSuccess = false;
            }

            // 3.4 Bajar notificaciones para la app (dinámicas por condición de servicio)
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
            if (!silent && uploadSuccess && downloadSuccess) {
                let message = '✓ Sincronización completada correctamente.';
                if (gestionesSynced > 0 || stockMovementsSynced > 0) {
                    const parts = [];
                    if (gestionesSynced > 0) {
                        parts.push(`${gestionesSynced} ${gestionesSynced === 1 ? 'servicio registrado' : 'servicios registrados'}`);
                    }
                    if (stockMovementsSynced > 0) {
                        parts.push(`${stockMovementsSynced} ${stockMovementsSynced === 1 ? 'movimiento de stock' : 'movimientos de stock'}`);
                    }
                    message = `✓ Sincronización exitosa.\n\nSe subieron: ${parts.join(', ')}.`;
                }
                Alert.alert('Sincronización Completa', message);
            }

            // Persist sync result to local log for diagnostics (non-critical)
            try {
                await db.saveSyncLog({
                    timestamp: new Date().toISOString(),
                    success: (uploadSuccess && downloadSuccess) ? 1 : 0,
                    upload_success: uploadSuccess ? 1 : 0,
                    download_success: downloadSuccess ? 1 : 0,
                    movimientos_enviados: stockMovementsSynced,
                    gestiones_enviadas: gestionesSynced,
                    error_detalle: null,
                    duracion_ms: Date.now() - syncStartTime,
                });
            } catch (logErr) {
                console.log('RouteContext: Failed to save sync log (non-critical):', logErr);
            }

        } catch (error) {
            syncErrorDetail = error instanceof Error ? error.message : String(error);
            console.error('RouteContext: Sync with backend failed:', error);
            if (db) {
                try {
                    await db.saveSyncLog({
                        timestamp: new Date().toISOString(),
                        success: 0,
                        upload_success: uploadSuccess ? 1 : 0,
                        download_success: 0,
                        movimientos_enviados: stockMovementsSynced,
                        gestiones_enviadas: gestionesSynced,
                        error_detalle: syncErrorDetail,
                        duracion_ms: Date.now() - syncStartTime,
                    });
                } catch (logErr) { /* ignore */ }
            }
            if (!silent) {
                Alert.alert('Error de sincronización', 'No se pudo conectar al servidor. Los datos locales se mantienen.');
            }
            // Don't clear local data on sync failure - keep working offline
        } finally {
            isSyncingRef.current = false;
            setRefreshing(false);
        }
    }, [user]);

    // Render local data first, then synchronize in the background on every app access.
    useEffect(() => {
        if (!user) return;
        let active = true;
        const loadAndSync = async () => {
            await fetchRouteData();
            if (active) void syncWithBackend({ silent: true });
        };
        void loadAndSync();
        return () => { active = false; };
    }, [user]);

    useEffect(() => {
        if (!user) return;
        let previousState: AppStateStatus = AppState.currentState;
        const subscription = AppState.addEventListener('change', (nextState) => {
            const returningToForeground = /inactive|background/.test(previousState) && nextState === 'active';
            previousState = nextState;
            if (returningToForeground) void syncWithBackend({ silent: true });
        });
        return () => subscription.remove();
    }, [user, syncWithBackend]);

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

    // Store applied stock info (also clears any order or novedad for this service)
    const setAppliedStock = (cita: string, ot: string, partida: number, stockInfo: AppliedStock) => {
        const key = getServiceKey(cita, ot, partida);
        setAppliedStocks(prev => {
            const newMap = new Map(prev);
            newMap.set(key, stockInfo);
            return newMap;
        });
        // Clear any existing order or novedad
        setGeneratedOrders(prev => { const m = new Map(prev); m.delete(key); return m; });
        setReportedNovedades(prev => { const m = new Map(prev); m.delete(key); return m; });
        updateServiceLocalStatus(cita, ot, partida, 'Stock');
        if (rutaActiva) {
            locationService.registerLocation(rutaActiva.id, 'REPORTE');
        }
    };

    // Get applied stock info by service ID
    const getAppliedStock = (cita: string, ot: string, partida: number) => {
        const key = getServiceKey(cita, ot, partida);
        return appliedStocks.get(key);
    };

    // Store reagendamiento info
    const setReagendamiento = (cita: string, ot: string, partida: number, info: ReagendamientoInfo) => {
        const key = getServiceKey(cita, ot, partida);
        setReagendamientos(prev => {
            const newMap = new Map(prev);
            newMap.set(key, info);
            console.log(`RouteContext: Stored reagendamiento for ${key}`);
            return newMap;
        });
        updateServiceLocalStatus(cita, ot, partida, 'Reagendado');
    };

    // Get reagendamiento info by service ID
    const getReagendamiento = (cita: string, ot: string, partida: number) => {
        const key = getServiceKey(cita, ot, partida);
        return reagendamientos.get(key);
    };

    // Check if a service is completed (has order, novedad, stock, OR reagendamiento)
    const isServiceCompleted = (cita: string, ot: string, partida: number): boolean => {
        const key = getServiceKey(cita, ot, partida);
        return generatedOrders.has(key) || reportedNovedades.has(key) || appliedStocks.has(key) || reagendamientos.has(key);
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
            appliedStocks,
            reagendamientos,
            fetchRouteData,
            syncWithBackend,
            getServiceById,
            getServicesByOT,
            updateServiceLocalStatus,
            setGeneratedOrder,
            getGeneratedOrder,
            setReportedNovedad,
            getReportedNovedad,
            setAppliedStock,
            getAppliedStock,
            setReagendamiento,
            getReagendamiento,
            isServiceCompleted,
            finalizarRuta,
        }}>
            {children}
        </RouteContext.Provider>
    );
};
