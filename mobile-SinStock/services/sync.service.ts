import api from './api.service';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// Database service reference (will be initialized on first use)
let databaseService: any = null;

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
                console.log(`[SyncService] plantillas_material recibidas: ${data.plantillas_material.length}`);
                await databaseService.savePlantillasMaterial(data.plantillas_material);
            } else {
                console.warn('[SyncService] plantillas_material no vino en la respuesta o no es array');
            }

            if (data.service_order_template) {
                await databaseService.saveTemplate('service_order', data.service_order_template);
            }

            console.log('SyncService: Metadata saved successfully.');

            // 5. After downloading metadata, try to upload any pending gestiones
            console.log('SyncService: Triggering pending gestiones upload...');
            const uploadResult = await this.syncPendingOrders();
            if (uploadResult.success && uploadResult.message !== 'No hay gestiones pendientes') {
                console.log(`SyncService: Pending sync completed - ${uploadResult.message}`);
            }

            // 7. Sync credential photo (with hash check for change detection)
            await this.syncCredentialPhoto();

            // 8. Sync pending locations
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
        return {
            success: true,
            message: 'Stock deshabilitado',
            timestamp: new Date().toISOString()
        };
    }

    // ==================== TRANSFERENCIAS (NUEVO SISTEMA) ====================

    /**
     * Get pending transfers for technician from backend
     * Returns null if backend is unavailable (preserve local cache)
     */
    async getTransferenciasPendientes(): Promise<any[] | null> {
        return [];
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
        void transferenciaId;
        void aceptar;
        void comentario;
        void cantidadesAceptadas;
        return {
            success: false,
            message: 'Stock deshabilitado',
            timestamp: new Date().toISOString(),
            stock_actualizado: []
        };
    }

    /**
     * Get stock assigned to technician
     * Uses /mobile/stock/tecnico endpoint (same as Ruta sync)
     * Returns null if backend is unavailable (preserve local cache)
     */
    async getMiStockDiscar(): Promise<any[] | null> {
        return [];
    }

    /**
     * Request return of materials to warehouse
     */
    async solicitarDevolucion(
        almacenDestino: string,
        items: Array<{ codigo_material: string, serie?: string, cantidad: number }>,
        comentario?: string
    ): Promise<SyncResult> {
        void almacenDestino;
        void items;
        void comentario;
        return {
            success: false,
            message: 'Stock deshabilitado',
            timestamp: new Date().toISOString()
        };
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
