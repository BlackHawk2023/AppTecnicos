import api from './api.service';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// Database service reference (will be initialized on first use)
let databaseService: any = null;

/** Genera UUID v4 para batch_id de sincronización */
function generateSyncBatchId(): string {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

// Helper function to read image file and convert to base64
async function readImageAsBase64(imagePath: string | null | undefined): Promise<string | null> {
    if (!imagePath) return null;

    try {
        // Check if file exists
        const fileInfo = await FileSystem.getInfoAsync(imagePath);
        if (!fileInfo.exists) {
            console.log(`SyncService: Image file not found: ${imagePath}`);
            return null;
        }

        // Log original file size
        const originalSize = (fileInfo as any).size || 0;
        console.log(`SyncService: Image size: ${(originalSize / 1024).toFixed(2)} KB at ${imagePath}`);

        // Read file as base64
        const base64 = await FileSystem.readAsStringAsync(imagePath, {
            encoding: 'base64',
        });

        return base64;

    } catch (error) {
        console.error(`SyncService: Error reading image ${imagePath}:`, error);
        return null;
    }
}

// Helper to get image filename from path
function getFilenameFromPath(path: string | null | undefined): string {
    if (!path) return 'image.jpg';
    const parts = path.split('/');
    return parts[parts.length - 1] || 'image.jpg';
}

// Helper to upload a single image to backend
async function uploadImageToGestion(gestionId: number, imagePath: string, tipo: string): Promise<boolean> {
    try {
        const base64 = await readImageAsBase64(imagePath);
        if (!base64) {
            console.log(`SyncService: Could not read image for gestion ${gestionId}`);
            return false;
        }

        const response = await api.post('/mobile/sync/upload/image', {
            gestion_id: gestionId,
            tipo: tipo,
            nombre: getFilenameFromPath(imagePath),
            contenido: base64
        });

        if (response.data?.success) {
            console.log(`SyncService: Uploaded image for gestion ${gestionId}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error(`SyncService: Failed to upload image for gestion ${gestionId}:`, error);
        return false;
    }
}

export interface SyncResult {
    success: boolean;
    message?: string;
    timestamp?: string;
}

class SyncService {

    /**
     * Download Metadata (Closures, Materials, Templates) from backend
     * and save to local SQLite DB.
     */
    async syncMetadata(): Promise<SyncResult> {
        // Skip SQLite on web platform
        if (Platform.OS === 'web') {
            console.log('SyncService: Skipping SQLite sync on web platform');
            return {
                success: true,
                message: 'Web platform - SQLite skipped',
                timestamp: new Date().toISOString()
            };
        }

        try {
            console.log('SyncService: Starting Metadata Sync...');

            // Check if user is authenticated before syncing
            const { AuthService } = await import('./auth.service');
            const user = await AuthService.getUser();
            if (!user) {
                console.log('SyncService: Skipping sync - no authenticated user');
                return {
                    success: false,
                    message: 'No authenticated user'
                };
            }

            // Initialize database service (platform-specific file loaded automatically)
            if (!databaseService) {
                const { createDatabaseService } = await import('../db/database');
                databaseService = createDatabaseService();
            }

            // 1. Initialize DB if not already
            await databaseService.init();

            // 2. Fetch from Backend
            const response = await api.get('/mobile/sync/metadata');
            const data = response.data;

            if (!data) {
                throw new Error('No data received from sync endpoint');
            }

            console.log(`SyncService: Received ${data.closure_types?.length || 0} closures, ${data.materials?.length || 0} materials.`);

            // 3. Save to Local DB
            if (data.closure_types) {
                await databaseService.saveClosureTypes(data.closure_types);
            }
            if (data.materials) {
                await databaseService.saveMaterials(data.materials);
            }

            if (data.plantillas_material && Array.isArray(data.plantillas_material)) {
                console.log(`[SyncService] plantillas_material recibidas: ${data.plantillas_material.length}`, JSON.stringify(data.plantillas_material.map((p: any) => ({ id: p.id, nombre: p.nombre, ti: p.tipo_incidente, tc: p.tipo_cierre, prod: p.producto, items: p.items?.length }))));
                await databaseService.savePlantillasMaterial(data.plantillas_material);
            } else {
                console.warn('[SyncService] plantillas_material NO vino en la respuesta del servidor o no es array', typeof data.plantillas_material);
            }

            if (data.service_order_template) {
                await databaseService.saveTemplate('service_order', data.service_order_template);
            }

            console.log('SyncService: Metadata saved successfully.');

            // 4. Download technician's current stock
            // FIX #4: Only replace local stock AFTER a successful download.
            // If the download fails, preserve the existing local stock to avoid
            // leaving the technician with empty stock mid-session.
            try {
                console.log('SyncService: Downloading technician stock...');
                const stockResponse = await api.get('/mobile/stock/tecnico');
                if (stockResponse.data && Array.isArray(stockResponse.data)) {
                    const stockItems = stockResponse.data.map((item: any) => ({
                        codigo_material: item.codigo_material,
                        nombre_material: item.nombre_material || '',
                        unidad_medida: item.unidad_medida || 'UNIDAD',
                        serie: item.serie,
                        cantidad: item.cantidad,
                        fecha_asignacion: item.fecha_asignacion,
                        condicion: item.condicion || 'BUENO',
                        ubicacion_codigo: item.ubicacion_codigo || null
                    }));
                    // saveStockLocal now deletes old and inserts new atomically,
                    // so we only reach here if the server returned valid data.
                    await databaseService.saveStockLocal(stockItems);
                    console.log(`SyncService: Saved ${stockItems.length} stock items`);
                } else {
                    console.log('SyncService: Server returned no stock data — preserving local cache');
                }
            } catch (stockError) {
                // FIX #4: DO NOT clear local stock on download failure.
                // The old code silently continued after the error, but saveStockLocal
                // had already been called (deleting local stock) in some code paths.
                // Now saveStockLocal is only called on success, so this catch is safe.
                console.warn('SyncService: Could not download stock — preserving local cache:', stockError);
            }

            // NOTE: syncPendingOrders and syncStockMovements are NOT called here.
            // When syncMetadata is called from RouteContext.syncWithBackend, uploads
            // are already handled in FASE 1 before this call. Doing them here again
            // would send duplicate network requests (and risk double-processing).
            // They are only relevant when syncMetadata is called standalone (e.g. login).

            // 5. Sync credential photo (with hash check for change detection)
            await this.syncCredentialPhoto();

            // 6. Sync pending locations
            await this.syncLocations();

            return {
                success: true,
                message: 'Metadatos actualizados',
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('SyncService Error:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Error desconocido en sincronización'
            };
        }
    }

    /**
     * Upload Pending Gestiones (Orders + Novedades) to Backend
     */
    async syncPendingOrders(): Promise<SyncResult> {
        // Skip SQLite on web platform
        if (Platform.OS === 'web') {
            console.log('SyncService: Skipping pending sync on web platform');
            return {
                success: true,
                message: 'Web platform - sync skipped',
                timestamp: new Date().toISOString()
            };
        }

        try {
            console.log('SyncService: Starting pending gestiones upload...');

            // Check if user is authenticated
            const { AuthService } = await import('./auth.service');
            const user = await AuthService.getUser();
            if (!user) {
                console.log('SyncService: Skipping sync - no authenticated user');
                return {
                    success: false,
                    message: 'No authenticated user'
                };
            }

            // Initialize database service
            if (!databaseService) {
                const { createDatabaseService } = await import('../db/database');
                databaseService = createDatabaseService();
            }

            await databaseService.init();

            // First, retry any pending image uploads from previous syncs
            console.log('SyncService: Checking for pending image uploads from previous syncs...');
            await this.processPendingImageUploads();

            // Get all pending gestiones
            const pendingGestiones = await databaseService.getPendingGestiones();

            if (pendingGestiones.length === 0) {
                console.log('SyncService: No pending gestiones to sync');
                return {
                    success: true,
                    message: 'No hay gestiones pendientes',
                    timestamp: new Date().toISOString()
                };
            }

            console.log(`SyncService: Found ${pendingGestiones.length} pending gestiones`);

            // Get ruta_id from LOCAL database (not backend)
            // This ensures we have the ruta_id even after route finalization or if backend returns no route
            let ruta_id = 0;
            try {
                const localRuta = await databaseService.getRutaActiva();
                if (localRuta?.ruta?.id) {
                    ruta_id = localRuta.ruta.id;
                }
            } catch (routeError) {
                console.log('Could not get local ruta_id, using 0:', routeError);
            }

            // Build gestiones array for backend - WITHOUT images (upload separately)
            const gestionesPayload = [];
            // Keep track of image paths to upload after sync
            const pendingImages: Array<{ localId: number, orderPath: string | null, novedadPath: string | null }> = [];

            for (const g of pendingGestiones) {
                // Parse materials if they're JSON strings
                let materialRetirado = g.material_retirado;
                let materialEntregado = g.material_entregado;
                try {
                    if (typeof materialRetirado === 'string') materialRetirado = JSON.parse(materialRetirado);
                    if (typeof materialEntregado === 'string') materialEntregado = JSON.parse(materialEntregado);
                } catch (e) { /* ignore parse errors */ }

                // Track images to upload after sync
                pendingImages.push({
                    localId: g.id,
                    orderPath: g.order_image_path || null,
                    novedadPath: g.novedad_image_path || null
                });

                gestionesPayload.push({
                    // Required fields
                    cita: g.cita,
                    ot: g.ot,
                    partida: g.partida,
                    tipo_gestion: g.tipo,
                    fecha_gestion: g.timestamp,

                    // Optional fields
                    terminal: g.terminal || null,
                    tipo_cierre: g.tipo_cierre || null,
                    detalle_trabajo: g.detalle_trabajo || null,
                    observaciones: g.observaciones || null,
                    nota_novedad: g.nota_novedad || null,
                    fecha_reagendada: g.fecha_reagendada || null,
                    turno_reagendamiento: g.turno_reagendamiento || null,

                    // Materials
                    material_retirado: materialRetirado || [],
                    material_entregado: materialEntregado || [],

                    // Signatures/Client
                    firma_cliente: g.cliente_firma || null,
                    firma_tecnico: g.tecnico_firma || null,
                    nombre_cliente: g.cliente_nombre || null,
                    dni_cliente: g.cliente_dni || null,

                    // Location
                    latitud: g.latitude || null,
                    longitud: g.longitude || null,

                    // Images - empty for now, upload separately
                    imagenes: []
                });
            }

            console.log('SyncService: Sending payload:', JSON.stringify({ ruta_id, gestiones_count: gestionesPayload.length }));

            // Upload gestiones to backend (without images)
            const response = await api.post('/mobile/sync/gestiones', {
                ruta_id: ruta_id,
                gestiones: gestionesPayload
            });

            if (response.data?.success) {
                const serverIds = response.data.ids || [];
                console.log(`SyncService: Gestiones synced, server IDs: ${serverIds}`);

                // Mark all as synced
                for (const g of pendingGestiones) {
                    await databaseService.markGestionSynced(g.id);
                }

                // Add images to pending uploads queue
                for (let i = 0; i < pendingImages.length && i < serverIds.length; i++) {
                    const imgInfo = pendingImages[i];
                    const serverId = serverIds[i];

                    // Queue order image for upload
                    if (imgInfo.orderPath) {
                        await databaseService.addPendingImageUpload(
                            imgInfo.localId,
                            serverId,
                            imgInfo.orderPath,
                            'ORDEN_GENERADA'
                        );
                    }

                    // Queue novedad image for upload
                    if (imgInfo.novedadPath) {
                        await databaseService.addPendingImageUpload(
                            imgInfo.localId,
                            serverId,
                            imgInfo.novedadPath,
                            'NOVEDAD_FOTO'
                        );
                    }
                }

                // Process pending image uploads from queue
                await this.processPendingImageUploads();

                console.log(`SyncService: Successfully synced ${pendingGestiones.length} gestiones`);

                return {
                    success: true,
                    message: `${pendingGestiones.length} gestiones sincronizadas`,
                    timestamp: new Date().toISOString()
                };
            } else {
                throw new Error(response.data?.message || 'Error en sincronización');
            }

        } catch (error: any) {
            console.error('SyncService syncPendingOrders Error:', error);
            return {
                success: false,
                message: error.response?.data?.detail || error.message || 'Error sincronizando gestiones'
            };
        }
    }

    /**
     * Process pending image uploads from queue (with retry support)
     */
    async processPendingImageUploads(): Promise<void> {
        if (Platform.OS === 'web') return;

        try {
            // Initialize database service if needed
            if (!databaseService) {
                const { createDatabaseService } = await import('../db/database');
                databaseService = createDatabaseService();
            }

            const pendingUploads = await databaseService.getPendingImageUploads();

            if (pendingUploads.length === 0) {
                console.log('SyncService: No pending image uploads');
                return;
            }

            console.log(`SyncService: Processing ${pendingUploads.length} pending image uploads...`);

            for (const upload of pendingUploads) {
                try {
                    console.log(`SyncService: Uploading image ${upload.id} for gestion ${upload.gestion_server_id}...`);

                    const success = await uploadImageToGestion(
                        upload.gestion_server_id,
                        upload.image_path,
                        upload.image_type
                    );

                    if (success) {
                        await databaseService.markImageUploaded(upload.id);
                        console.log(`SyncService: Image ${upload.id} uploaded successfully`);
                    } else {
                        await databaseService.updateImageUploadError(upload.id, 'Upload returned false');
                    }
                } catch (uploadError: any) {
                    console.error(`SyncService: Error uploading image ${upload.id}:`, uploadError);
                    await databaseService.updateImageUploadError(
                        upload.id,
                        uploadError.message || 'Unknown error'
                    );
                }
            }
        } catch (error) {
            console.error('SyncService: Error processing pending image uploads:', error);
        }
    }

    // Sync pending stock movements to backend
    async syncStockMovements(): Promise<SyncResult> {
        if (Platform.OS === 'web') {
            return { success: true, message: 'Stock sync not available on web' };
        }

        try {
            // Initialize database service if needed
            if (!databaseService) {
                const { createDatabaseService } = await import('../db/database');
                databaseService = createDatabaseService();
                await databaseService.init();
            }

            // Get pending movements
            const pendingMovements = await databaseService.getMovimientosPendientes();

            if (pendingMovements.length === 0) {
                console.log('SyncService: No pending stock movements to sync');
                return { success: true, message: 'No hay movimientos pendientes' };
            }

            console.log(`SyncService: Syncing ${pendingMovements.length} stock movements...`);

            // Prepare movements for API - convert foto_serie from path to base64
            const movimientos = await Promise.all(pendingMovements.map(async (m: any) => {
                // Convert foto_serie path to base64 if present
                let foto_serie_base64: string | null = null;
                if (m.foto_serie) {
                    foto_serie_base64 = await readImageAsBase64(m.foto_serie);
                }

                return {
                    codigo_material: m.codigo_material,
                    serie: m.serie,
                    cantidad: m.cantidad,
                    tipo_movimiento: m.tipo_movimiento,
                    cita: m.cita,
                    ot: m.ot,
                    partida: m.partida,
                    foto_serie: foto_serie_base64,
                    fecha_hora: m.fecha_hora,  // Use actual movement time, not sync time
                    condicion: m.condicion || 'BUENO'
                };
            }));

            // Send to backend with batch_id for idempotency
            // batch_id is persisted in SQLite so retries reuse the same UUID
            const batch_id = await databaseService.getOrCreateStockBatchId();
            const response = await api.post('/mobile/stock/sync-movimientos', {
                movimientos: movimientos,
                batch_id: batch_id
            });

            if (response.data?.success) {
                // Mark as synced
                const ids = pendingMovements.map((m: any) => m.id);
                await databaseService.markMovimientosSynced(ids);

                // Clear synced movements
                await databaseService.clearSyncedMovimientos();

                // Reset batch_id so next sync group gets a fresh UUID
                await databaseService.clearStockBatchId();

                console.log(`SyncService: Successfully synced ${pendingMovements.length} stock movements`);
                return {
                    success: true,
                    message: `${pendingMovements.length} movimientos sincronizados`,
                    timestamp: new Date().toISOString()
                };
            } else {
                return { success: false, message: 'Error en respuesta del servidor' };
            }
        } catch (error: any) {
            console.error('SyncService: Error syncing stock movements:', error);
            return {
                success: false,
                message: error.message || 'Error sincronizando movimientos de stock'
            };
        }
    }

    // ==================== TRANSFERENCIAS (NUEVO SISTEMA) ====================

    /**
     * Get pending transfers for technician from backend
     * Returns null if backend is unavailable (preserve local cache)
     */
    async getTransferenciasPendientes(): Promise<any[] | null> {
        try {
            const response = await api.get('/mobile/stock/transferencias/pendientes');
            return response.data || [];
        } catch (error: any) {
            console.error('SyncService: Error fetching transferencias pendientes:', error);
            return null; // Return null to indicate error (preserve local cache)
        }
    }

    /**
     * Respond to a transfer (accept/reject)
     * Returns stock_actualizado in the result for immediate update
     */
    async responderTransferencia(
        transferenciaId: number,
        aceptar: boolean,
        comentario?: string,
        cantidadesAceptadas?: Array<{ item_id: number, cantidad: number }>
    ): Promise<SyncResult & { stock_actualizado?: any[] }> {
        try {
            const response = await api.post(`/mobile/stock/transferencias/${transferenciaId}/responder`, {
                aceptar,
                comentario,
                cantidades_aceptadas: cantidadesAceptadas
            });

            if (response.data?.success) {
                return {
                    success: true,
                    message: response.data.message || `Transferencia ${aceptar ? 'aceptada' : 'rechazada'}`,
                    timestamp: new Date().toISOString(),
                    stock_actualizado: response.data.stock_actualizado || []
                };
            }
            return { success: false, message: response.data?.detail || 'Error en respuesta' };
        } catch (error: any) {
            console.error('SyncService: Error responding to transfer:', error);
            return {
                success: false,
                message: error.response?.data?.detail || error.message || 'Error respondiendo transferencia'
            };
        }
    }

    /**
     * Get stock assigned to technician
     * Uses /mobile/stock/tecnico endpoint (same as Ruta sync)
     * Returns null if backend is unavailable (preserve local cache)
     */
    async getMiStockDiscar(): Promise<any[] | null> {
        try {
            // Use same endpoint as Ruta sync for consistency
            const response = await api.get('/mobile/stock/tecnico');
            return response.data || [];
        } catch (error: any) {
            console.error('SyncService: Error fetching stock:', error);
            return null; // Return null to indicate error (preserve local cache)
        }
    }

    /**
     * Request return of materials to warehouse
     */
    async solicitarDevolucion(
        almacenDestino: string,
        items: Array<{ codigo_material: string, serie?: string, cantidad: number, condicion?: string }>,
        comentario?: string
    ): Promise<SyncResult> {
        try {
            const response = await api.post('/mobile/stock/solicitar-devolucion', {
                almacen_destino: almacenDestino,
                items,
                comentario
            });

            if (response.data?.success) {
                return {
                    success: true,
                    message: response.data.message || 'Devolución solicitada',
                    timestamp: new Date().toISOString()
                };
            }
            return { success: false, message: response.data?.detail || 'Error en respuesta' };
        } catch (error: any) {
            console.error('SyncService: Error requesting return:', error);
            return {
                success: false,
                message: error.response?.data?.detail || error.message || 'Error solicitando devolución'
            };
        }
    }

    // ==================== CREDENTIAL PHOTO SYNC ====================

    /**
     * Sync credential photo using hash comparison for change detection.
     * Only downloads the photo if the hash has changed.
     */
    async syncCredentialPhoto(): Promise<SyncResult> {
        if (Platform.OS === 'web') {
            return { success: true, message: 'Credential sync not available on web' };
        }

        try {
            // Initialize database service if needed
            if (!databaseService) {
                const { createDatabaseService } = await import('../db/database');
                databaseService = createDatabaseService();
                await databaseService.init();
            }

            // 1. Get local hash
            const local = await (databaseService as any).getCredentialPhoto();
            const localHash = local?.hash || null;

            // 2. Get server hash
            let serverHash: string | null = null;
            try {
                const hashResponse = await api.get('/mobile/sync/profile/credential-hash');
                serverHash = hashResponse.data?.hash || null;
            } catch (hashError) {
                console.log('SyncService: Could not get credential hash:', hashError);
                return { success: true, message: 'Credential hash check skipped' };
            }

            // 3. Compare hashes - if same, no need to download
            if (localHash && serverHash && localHash === serverHash) {
                console.log('SyncService: Credential photo unchanged (hash match)');
                return { success: true, message: 'Credential photo unchanged' };
            }

            // 4. If no server hash, user has no photo configured
            if (!serverHash) {
                console.log('SyncService: No credential photo configured on server');
                return { success: true, message: 'No credential photo configured' };
            }

            // 5. Download the full photo
            console.log('SyncService: Credential photo changed, downloading...');
            const photoResponse = await api.get('/mobile/sync/profile/credential-photo');
            const photoData = photoResponse.data?.data;
            const mimeType = photoResponse.data?.mime_type || 'image/jpeg';

            if (photoData) {
                // Build data URI if not already
                const dataUri = photoData.startsWith('data:')
                    ? photoData
                    : `data:${mimeType};base64,${photoData}`;

                // Save to local DB
                await (databaseService as any).saveCredentialPhoto(dataUri, serverHash);
                console.log('SyncService: Credential photo saved locally');

                return {
                    success: true,
                    message: 'Credential photo updated',
                    timestamp: new Date().toISOString()
                };
            }

            return { success: true, message: 'No credential photo data received' };

        } catch (error: any) {
            console.error('SyncService: Error syncing credential photo:', error);
            return {
                success: false,
                message: error.message || 'Error syncing credential photo'
            };
        }
    }

    // ==================== LOCATION SYNC ====================

    /**
     * Sync pending locations to backend
     */
    async syncLocations(): Promise<SyncResult> {
        if (Platform.OS === 'web') {
            return { success: true, message: 'Location sync not available on web' };
        }

        try {
            const { locationService } = await import('./location.service');
            await locationService.syncPendingLocations();
            return {
                success: true,
                message: 'Ubicaciones sincronizadas',
                timestamp: new Date().toISOString()
            };
        } catch (error: any) {
            console.error('SyncService: Error syncing locations:', error);
            return {
                success: false,
                message: error.message || 'Error sincronizando ubicaciones'
            };
        }
    }
}

export const syncService = new SyncService();
