// Database Service - Native implementation with SQLite
// This file is only loaded on iOS/Android platforms
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'stdiscar.db';

/** UUID v4 generator sin dependencias externas */
function generateUUID(): string {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export interface DatabaseService {
    init(): Promise<void>;
    getDb(): Promise<any>;
    saveClosureTypes(closures: any[]): Promise<void>;
    saveMaterials(materials: any[]): Promise<void>;
    saveTemplate(key: string, content: string): Promise<void>;
    getMaterials(): Promise<any[]>;
    getClosureTypes(): Promise<any[]>;
    getTemplate(key: string): Promise<string | null>;
    // Gestiones (unified orders + novedades)
    saveGestion(gestion: GestionData): Promise<number>;
    getPendingGestiones(): Promise<GestionRecord[]>;
    markGestionSynced(id: number): Promise<void>;
    getGestionByService(cita: string, ot: string, partida: number): Promise<GestionRecord | null>;
    getGestionesByRuta(rutaId: number): Promise<GestionRecord[]>;
    // Cleanup methods
    hasPendingGestiones(): Promise<boolean>;
    clearSyncedGestiones(): Promise<number>;
    clearAllGestiones(): Promise<number>;
    clearGestionesNotInRuta(currentRutaId: number | null): Promise<number>;
    clearPendingImageUploads(): Promise<void>;
    // Pending image uploads queue
    addPendingImageUpload(gestionLocalId: number, gestionServerId: number, imagePath: string, imageType: string): Promise<number>;
    getPendingImageUploads(): Promise<PendingImageUpload[]>;
    markImageUploaded(id: number): Promise<void>;
    updateImageUploadError(id: number, error: string): Promise<void>;
    removePendingImageUpload(id: number): Promise<void>;
    getImageUploadsByGestionServerId(gestionServerId: number): Promise<PendingImageUpload[]>;
    // Stock local methods
    getStockLocal(): Promise<StockLocalItem[]>;
    saveStockLocal(items: StockLocalItem[]): Promise<void>;
    updateStockLocal(codigoMaterial: string, serie: string | null, cantidad: number, tipo: 'add' | 'remove', condicion?: string): Promise<void>;
    changeCondicionLocal(codigoMaterial: string, serie: string | null, cantidad: number, nuevaCondicion: string): Promise<void>;
    // Movimientos pendientes
    addMovimientoPendiente(mov: MovimientoPendiente): Promise<number>;
    getMovimientosPendientes(): Promise<MovimientoPendiente[]>;
    markMovimientosSynced(ids: number[]): Promise<void>;
    clearSyncedMovimientos(): Promise<void>;
    // Ruta activa methods
    saveRutaActiva(ruta: any, servicios: any[]): Promise<void>;
    getRutaActiva(): Promise<{ ruta: any; cachedAt: number } | null>;
    getServiciosRuta(rutaId: number): Promise<any[]>;
    clearRutaActiva(): Promise<void>;
    // Transferencias pendientes (cache local)
    saveTransferenciasPendientes(transferencias: any[]): Promise<void>;
    getTransferenciasPendientes(): Promise<any[]>;
    clearTransferenciasPendientes(): Promise<void>;
    // Ubicaciones Tracking
    saveUbicacion(ubicacion: UbicacionTracking): Promise<void>;
    getPendingUbicaciones(): Promise<UbicacionTracking[]>;
    markUbicacionesSynced(ids: number[]): Promise<void>;
    clearUbicaciones(): Promise<void>;
    // App Notificaciones (sincronizadas desde el backend para condicionar por cita)
    saveAppNotificaciones(items: AppNotificacion[]): Promise<void>;
    getAppNotificaciones(): Promise<AppNotificacion[]>;
    clearAppNotificaciones(): Promise<void>;
    // Plantillas de materiales
    savePlantillasMaterial(plantillas: any[]): Promise<void>;
    getPlantillasMaterial(tipo_incidente?: string, tipo_cierre?: string): Promise<any[]>;
    // Sync diagnostics log
    saveSyncLog(entry: SyncLogEntry): Promise<void>;
    getLastSyncLogs(limit?: number): Promise<SyncLogEntry[]>;
    // Stock sync idempotency
    getOrCreateStockBatchId(): Promise<string>;
    clearStockBatchId(): Promise<void>;
    // Borradores recuperables de flujos de servicio
    saveServiceDraft(key: string, payload: any): Promise<void>;
    getServiceDraft(key: string): Promise<any | null>;
    deleteServiceDraft(key: string): Promise<void>;
}

// Type for saving a new gestion
export interface GestionData {
    tipo: 'ORDEN' | 'NOVEDAD' | 'STOCK' | 'REAGENDAMIENTO';
    ruta_id: number;  // Route ID for tracking
    cita: string;
    ot: string;
    partida: number;
    terminal?: string;
    tipo_cierre?: string;
    detalle_trabajo?: string;
    observaciones?: string;
    material_retirado?: string;  // JSON string
    material_entregado?: string; // JSON string
    cliente_nombre?: string;
    cliente_dni?: string;
    cliente_firma?: string;      // base64
    tecnico_nombre?: string;
    tecnico_dni?: string;
    tecnico_firma?: string;      // base64
    order_image_path?: string;
    nota_novedad?: string;
    novedad_image_path?: string;
    fecha_reagendada?: string | null;
    turno_reagendamiento?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    timestamp: string;
}

// Type for reading gestion from DB
export interface GestionRecord extends GestionData {
    id: number;
    status: 'PENDING' | 'SYNCED' | 'FAILED';
    created_at: number;
    ruta_id: number;
}

// Type for pending image upload queue
export interface PendingImageUpload {
    id: number;
    gestion_local_id: number;
    gestion_server_id: number;
    image_path: string;
    image_type: string;  // 'ORDEN_GENERADA' | 'NOVEDAD_FOTO'
    retry_count: number;
    last_error: string | null;
    created_at: number;
    uploaded_at: number | null;
}

// Type for local stock items
export interface StockLocalItem {
    id?: number;
    codigo_material: string;
    nombre_material: string;
    unidad_medida: string;  // UNIDAD o SERIALIZADO
    serie: string | null;
    cantidad: number;
    fecha_asignacion?: string;
    condicion: string;         // 'BUENO' | 'CONTROL' | 'BLOQUEADO'
    ubicacion_codigo?: string; // Código de ubicación del técnico
}

// Type for pending movement to sync
export interface MovimientoPendiente {
    id?: number;
    uuid?: string;  // UUID único para deduplicación
    codigo_material: string;
    serie: string | null;
    cantidad: number;
    tipo_movimiento: 'RETIRO' | 'ENTREGA';
    condicion?: string;  // Condición del material al momento del movimiento
    cita: string;
    ot: string;
    partida: number;
    foto_serie: string | null;
    fecha_hora: string;
    synced?: number;
}

// Type for location tracking
export interface UbicacionTracking {
    id?: number;
    ruta_id: number;
    latitud: number;
    longitud: number;
    precision: number | null;
    tipo_registro: 'RECEPCION' | 'AUTOMATICO' | 'ORDEN' | 'REPORTE' | 'FINALIZACION';
    fecha_hora: string;
    synced?: number;
}

// Type for app notifications (synced from backend)
export interface AppNotificacion {
    id: string;
    tipo_incidente: string;
    producto: string;
    campania: string;
    mensaje: string;
    prioridad: 'critico' | 'importante' | 'info';
    fecha_inicio?: string;
    fecha_fin?: string;
}

// Type for sync operation audit log
export interface SyncLogEntry {
    id?: number;
    timestamp: string;
    success: number;           // 1 = success, 0 = failure
    upload_success: number;
    download_success: number;
    movimientos_enviados: number;
    gestiones_enviadas: number;
    error_detalle: string | null;
    duracion_ms: number;
}


// Database service implementation
class DatabaseServiceImpl implements DatabaseService {
    private db: any = null;
    private initPromise: Promise<void> | null = null;
    private isInitialized: boolean = false;

    async getDb(): Promise<any> {
        if (!this.db) {
            // Wait for any pending initialization
            if (this.initPromise) {
                await this.initPromise;
            } else {
                this.initPromise = this.openDatabase();
                await this.initPromise;
                this.initPromise = null;
            }
        }
        return this.db;
    }

    private async openDatabase(): Promise<void> {
        if (!this.db) {
            console.log('DatabaseService: Opening database...');
            this.db = await SQLite.openDatabaseAsync(DB_NAME);
            console.log('DatabaseService: Database opened successfully');
        }
    }

    async init(): Promise<void> {
        // Skip if already initialized
        if (this.isInitialized) {
            console.log('DatabaseService: Already initialized, skipping');
            return;
        }

        const db = await this.getDb();
        this.isInitialized = true;

        // Define Tables
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS metadata_closure_types (
                id INTEGER PRIMARY KEY,
                estado TEXT,
                subestado TEXT NOT NULL,
                descripcion TEXT,
                categoria TEXT,
                agrupador TEXT,
                requires_photo INTEGER DEFAULT 0
            );
        `);

        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS metadata_materials (
                id INTEGER PRIMARY KEY,
                codigo_material TEXT UNIQUE,
                nombre TEXT,
                unidad_medida TEXT,
                categoria TEXT
            );
        `);

        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS templates (
                key TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                updated_at INTEGER
            );
        `);

        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS service_drafts (
                ot TEXT PRIMARY KEY,
                cita TEXT NOT NULL,
                partida INTEGER NOT NULL,
                current_step INTEGER DEFAULT 0,
                form_data JSON,
                client_signature_path TEXT,
                is_sync_pending INTEGER DEFAULT 0,
                updated_at INTEGER
            );
        `);

        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS technician_profile (
                id INTEGER PRIMARY KEY DEFAULT 1,
                nombre_completo TEXT,
                dni TEXT,
                signature_path TEXT,
                updated_at INTEGER
            );
        `);

        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS service_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ot TEXT NOT NULL,
                cita TEXT NOT NULL,
                partida INTEGER NOT NULL,
                type TEXT NOT NULL,
                note TEXT,
                image_path TEXT,
                latitude REAL,
                longitude REAL,
                timestamp TEXT NOT NULL,
                status TEXT DEFAULT 'PENDING',
                created_at INTEGER
            );
        `);

        // Unified gestiones table for both ORDEN and NOVEDAD
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS gestiones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,
                cita TEXT NOT NULL,
                ot TEXT NOT NULL,
                partida INTEGER NOT NULL,
                terminal TEXT,
                tipo_cierre TEXT,
                detalle_trabajo TEXT,
                observaciones TEXT,
                material_retirado TEXT,
                material_entregado TEXT,
                cliente_nombre TEXT,
                cliente_dni TEXT,
                cliente_firma TEXT,
                tecnico_nombre TEXT,
                tecnico_dni TEXT,
                tecnico_firma TEXT,
                order_image_path TEXT,
                nota_novedad TEXT,
                novedad_image_path TEXT,
                latitude REAL,
                longitude REAL,
                timestamp TEXT NOT NULL,
                status TEXT DEFAULT 'PENDING',
                created_at INTEGER
            );
        `);

        // Migration: Add ruta_id column if it doesn't exist
        try {
            await db.execAsync(`ALTER TABLE gestiones ADD COLUMN ruta_id INTEGER DEFAULT 0`);
            console.log('Database: Added ruta_id column to gestiones table');
        } catch (e) {
            // Column already exists, ignore
        }

        // Migration: Add reagendamiento columns if they don't exist
        try {
            await db.execAsync(`ALTER TABLE gestiones ADD COLUMN fecha_reagendada TEXT`);
        } catch (e) { /* Column already exists */ }
        try {
            await db.execAsync(`ALTER TABLE gestiones ADD COLUMN turno_reagendamiento TEXT`);
        } catch (e) { /* Column already exists */ }

        // Table for tracking pending image uploads (retry queue)
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS pending_image_uploads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gestion_local_id INTEGER NOT NULL,
                gestion_server_id INTEGER,
                image_path TEXT NOT NULL,
                image_type TEXT NOT NULL,
                retry_count INTEGER DEFAULT 0,
                last_error TEXT,
                created_at INTEGER NOT NULL,
                uploaded_at INTEGER
            );
        `);

        // Index for faster lookup of pending uploads
        await db.execAsync(`
            CREATE INDEX IF NOT EXISTS idx_pending_uploads_server_id 
            ON pending_image_uploads(gestion_server_id);
        `);

        // ==================== STOCK TABLES ====================

        // Stock local del técnico
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS stock_local (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo_material TEXT NOT NULL,
                nombre_material TEXT,
                unidad_medida TEXT,
                serie TEXT,
                cantidad REAL NOT NULL,
                fecha_asignacion TEXT,
                condicion TEXT DEFAULT 'BUENO',
                ubicacion_codigo TEXT,
                UNIQUE(codigo_material, serie, condicion)
            );
        `);

        // Migration for existing databases:
        // 1. Add missing columns (condicion, ubicacion_codigo)
        // 2. Recreate table with correct UNIQUE constraint (include condicion)
        try {
            await db.execAsync(`ALTER TABLE stock_local ADD COLUMN condicion TEXT DEFAULT 'BUENO'`);
        } catch (e) {
            // Column already exists
        }
        try {
            await db.execAsync(`ALTER TABLE stock_local ADD COLUMN ubicacion_codigo TEXT`);
        } catch (e) {
            // Column already exists
        }

        // Check if we need to migrate the UNIQUE constraint
        // If the old constraint exists (without condicion), recreate the table
        try {
            // Try inserting two rows with same material but different condition
            // If it fails, the old constraint is still active and we need to migrate
            await db.execAsync(`
                INSERT INTO stock_local (codigo_material, nombre_material, unidad_medida, serie, cantidad, condicion) 
                VALUES ('__MIGRATION_TEST__', 'test', 'UNIDAD', NULL, 1, 'BUENO')
            `);
            await db.execAsync(`
                INSERT INTO stock_local (codigo_material, nombre_material, unidad_medida, serie, cantidad, condicion) 
                VALUES ('__MIGRATION_TEST__', 'test', 'UNIDAD', NULL, 1, 'CONTROL')
            `);
            // If we got here, the constraint already includes condicion - clean up test rows
            await db.execAsync(`DELETE FROM stock_local WHERE codigo_material = '__MIGRATION_TEST__'`);
        } catch (e) {
            // Old constraint blocks the insert - need to recreate table
            console.log('DatabaseService: Migrating stock_local UNIQUE constraint to include condicion...');
            await db.execAsync(`DELETE FROM stock_local WHERE codigo_material = '__MIGRATION_TEST__'`);
            await db.execAsync(`
                CREATE TABLE IF NOT EXISTS stock_local_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    codigo_material TEXT NOT NULL,
                    nombre_material TEXT,
                    unidad_medida TEXT,
                    serie TEXT,
                    cantidad REAL NOT NULL,
                    fecha_asignacion TEXT,
                    condicion TEXT DEFAULT 'BUENO',
                    ubicacion_codigo TEXT,
                    UNIQUE(codigo_material, serie, condicion)
                );
            `);
            await db.execAsync(`
                INSERT INTO stock_local_new (codigo_material, nombre_material, unidad_medida, serie, cantidad, fecha_asignacion, condicion, ubicacion_codigo)
                SELECT codigo_material, nombre_material, unidad_medida, serie, cantidad, fecha_asignacion, 
                       COALESCE(condicion, 'BUENO'), ubicacion_codigo
                FROM stock_local;
            `);
            await db.execAsync(`DROP TABLE stock_local`);
            await db.execAsync(`ALTER TABLE stock_local_new RENAME TO stock_local`);
            console.log('DatabaseService: stock_local constraint migration complete.');
        }

        // Movimientos pendientes de sincronizar
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS movimientos_pendientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT,
                codigo_material TEXT NOT NULL,
                serie TEXT,
                cantidad INTEGER DEFAULT 1,
                tipo_movimiento TEXT NOT NULL,
                condicion TEXT,
                cita TEXT NOT NULL,
                ot TEXT NOT NULL,
                partida INTEGER NOT NULL,
                foto_serie TEXT,
                fecha_hora TEXT NOT NULL,
                synced INTEGER DEFAULT 0
            );
        `);

        // Migration: Add condicion column to existing movimientos_pendientes tables
        try {
            await db.execAsync(`ALTER TABLE movimientos_pendientes ADD COLUMN condicion TEXT`);
        } catch (e) {
            // Column already exists - expected on new installs
        }

        // Migration: Add uuid column to existing movimientos_pendientes tables
        try {
            await db.execAsync(`ALTER TABLE movimientos_pendientes ADD COLUMN uuid TEXT`);
        } catch (e) {
            // Column already exists - expected on new installs
        }

        // Index para movimientos no sincronizados
        await db.execAsync(`
            CREATE INDEX IF NOT EXISTS idx_movimientos_synced 
            ON movimientos_pendientes(synced);
        `);

        // ==================== RUTA ACTIVA TABLES ====================

        // Tabla para la ruta activa del técnico
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS ruta_activa (
                id INTEGER PRIMARY KEY,
                tecnico_id TEXT,
                fecha TEXT,
                estado TEXT,
                total_servicios INTEGER,
                ruta_json TEXT,
                cached_at INTEGER
            );
        `);

        // Tabla para los servicios de la ruta
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS ruta_servicios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ruta_id INTEGER NOT NULL,
                cita TEXT NOT NULL,
                ot TEXT NOT NULL,
                partida INTEGER NOT NULL,
                servicio_json TEXT NOT NULL,
                cached_at INTEGER,
                UNIQUE(cita, ot, partida)
            );
        `);

        // Index para búsqueda rápida de servicios por ruta
        await db.execAsync(`
            CREATE INDEX IF NOT EXISTS idx_ruta_servicios_ruta_id 
            ON ruta_servicios(ruta_id);
        `);

        // ==================== TRANSFERENCIAS PENDIENTES ====================

        // Tabla para cache de transferencias pendientes
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS transferencias_pendientes (
                id INTEGER PRIMARY KEY,
                data_json TEXT NOT NULL,
                cached_at INTEGER
            );
        `);

        // ==================== UBICACIONES TRACKING ====================

        // Tabla para tracking de ubicaciones
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS ubicaciones_tracking (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ruta_id INTEGER NOT NULL,
                latitud REAL,
                longitud REAL,
                precision REAL,
                tipo_registro TEXT NOT NULL,
                fecha_hora TEXT NOT NULL,
                synced INTEGER DEFAULT 0
            );
        `);

        // Index para ubicaciones no sincronizadas
        await db.execAsync(`
            CREATE INDEX IF NOT EXISTS idx_ubicaciones_synced 
            ON ubicaciones_tracking(synced);
        `);

        // ==================== CREDENTIAL PHOTO MIGRATION ====================
        // Migration: Add credential photo columns if they don't exist
        try {
            await db.execAsync(`ALTER TABLE technician_profile ADD COLUMN credential_photo TEXT`);
            console.log('Database: Added credential_photo column to technician_profile');
        } catch (e) {
            // Column already exists, ignore
        }
        try {
            await db.execAsync(`ALTER TABLE technician_profile ADD COLUMN credential_hash TEXT`);
            console.log('Database: Added credential_hash column to technician_profile');
        } catch (e) {
            // Column already exists, ignore
        }

        // ==================== APP NOTIFICACIONES ====================
        // Cache de notificaciones para la app móvil (sincronizadas desde el backend)
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS app_notificaciones (
                id TEXT PRIMARY KEY,
                tipo_incidente TEXT DEFAULT '',
                producto TEXT DEFAULT '',
                campania TEXT DEFAULT '',
                mensaje TEXT NOT NULL,
                prioridad TEXT DEFAULT 'info',
                fecha_inicio TEXT,
                fecha_fin TEXT,
                cached_at INTEGER
            );
        `);

        // ==================== PLANTILLAS DE MATERIALES ====================
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS plantillas_material (
                id INTEGER PRIMARY KEY,
                nombre TEXT NOT NULL,
                tipo_incidente TEXT,
                tipo_cierre TEXT,
                producto TEXT
            );
        `);
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS plantillas_material_items (
                id INTEGER PRIMARY KEY,
                plantilla_id INTEGER NOT NULL,
                tipo TEXT NOT NULL,
                codigo_material TEXT,
                nombre_material TEXT,
                unidad_medida TEXT,
                cantidad INTEGER,
                orden INTEGER DEFAULT 0
            );
        `);
        await db.execAsync(`
            CREATE INDEX IF NOT EXISTS idx_plantillas_items_plantilla
            ON plantillas_material_items(plantilla_id);
        `);

        // ==================== SYNC LOG ====================
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS sync_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                success INTEGER DEFAULT 0,
                upload_success INTEGER DEFAULT 0,
                download_success INTEGER DEFAULT 0,
                movimientos_enviados INTEGER DEFAULT 0,
                gestiones_enviadas INTEGER DEFAULT 0,
                error_detalle TEXT,
                duracion_ms INTEGER DEFAULT 0
            );
        `);

        // Schema migration guards: add columns that may be missing in older builds
        try {
            await db.execAsync(`ALTER TABLE plantillas_material_items ADD COLUMN nombre_material TEXT`);
            console.log('Database: Added nombre_material column to plantillas_material_items');
        } catch (e) { /* column already exists */ }
        try {
            await db.execAsync(`ALTER TABLE plantillas_material_items ADD COLUMN unidad_medida TEXT`);
            console.log('Database: Added unidad_medida column to plantillas_material_items');
        } catch (e) { /* column already exists */ }

        // ==================== APP SETTINGS (KV) ====================
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);

        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS workflow_drafts (
                key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
        `);

        console.log('Database initialized and tables verified.');
    }

    async saveClosureTypes(closures: any[]): Promise<void> {
        const db = await this.getDb();
        // Transaction removed to avoid 'cannot start a transaction within a transaction' error
        await db.runAsync('DELETE FROM metadata_closure_types');
        for (const c of closures) {
            await db.runAsync(
                'INSERT INTO metadata_closure_types (id, estado, subestado, descripcion, categoria, agrupador, requires_photo) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [c.id, c.estado, c.subestado, c.descripcion, c.categoria, c.agrupador, c.requires_photo ? 1 : 0]
            );
        }
    }

    async saveMaterials(materials: any[]): Promise<void> {
        const db = await this.getDb();
        // Transaction removed to avoid 'cannot start a transaction within a transaction' error
        await db.runAsync('DELETE FROM metadata_materials');
        for (const m of materials) {
            await db.runAsync(
                'INSERT INTO metadata_materials (id, codigo_material, nombre, unidad_medida, categoria) VALUES (?, ?, ?, ?, ?)',
                [m.id, m.codigo_material, m.nombre, m.unidad_medida, m.categoria]
            );
        }
    }

    async saveTemplate(key: string, content: string): Promise<void> {
        const db = await this.getDb();
        const now = Date.now();
        await db.runAsync(
            'INSERT OR REPLACE INTO templates (key, content, updated_at) VALUES (?, ?, ?)',
            [key, content, now]
        );
    }

    async getMaterials(): Promise<any[]> {
        const db = await this.getDb();
        return await db.getAllAsync('SELECT * FROM metadata_materials ORDER BY nombre');
    }

    async getClosureTypes(): Promise<any[]> {
        const db = await this.getDb();
        return await db.getAllAsync('SELECT * FROM metadata_closure_types ORDER BY agrupador, subestado');
    }

    async getTemplate(key: string): Promise<string | null> {
        const db = await this.getDb();
        const result: any = await db.getFirstAsync('SELECT content FROM templates WHERE key = ?', [key]);
        return result ? result.content : null;
    }

    async saveServiceReport(report: {
        ot: string,
        cita: string,
        partida: number,
        type: string,
        note: string,
        image_path?: string,
        latitude?: number | null,
        longitude?: number | null,
        timestamp: string
    }): Promise<void> {
        const db = await this.getDb();
        const now = Date.now();
        await db.runAsync(
            `INSERT INTO service_reports (ot, cita, partida, type, note, image_path, latitude, longitude, timestamp, created_at, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
            [report.ot, report.cita, report.partida, report.type, report.note, report.image_path || null, report.latitude || null, report.longitude || null, report.timestamp, now]
        );
    }

    async getPendingReports(): Promise<any[]> {
        const db = await this.getDb();
        return await db.getAllAsync("SELECT * FROM service_reports WHERE status = 'PENDING'");
    }

    // =============== GESTIONES (Unified Orders + Novedades) ===============

    async saveGestion(gestion: GestionData): Promise<number> {
        const db = await this.getDb();
        const now = Date.now();

        const result = await db.runAsync(
            `INSERT INTO gestiones (
                tipo, ruta_id, cita, ot, partida, terminal, tipo_cierre, detalle_trabajo, 
                observaciones, material_retirado, material_entregado, 
                cliente_nombre, cliente_dni, cliente_firma,
                tecnico_nombre, tecnico_dni, tecnico_firma,
                order_image_path, nota_novedad, novedad_image_path,
                fecha_reagendada, turno_reagendamiento,
                latitude, longitude, timestamp, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
            [
                gestion.tipo,
                gestion.ruta_id,
                gestion.cita,
                gestion.ot,
                gestion.partida,
                gestion.terminal || null,
                gestion.tipo_cierre || null,
                gestion.detalle_trabajo || null,
                gestion.observaciones || null,
                gestion.material_retirado || null,
                gestion.material_entregado || null,
                gestion.cliente_nombre || null,
                gestion.cliente_dni || null,
                gestion.cliente_firma || null,
                gestion.tecnico_nombre || null,
                gestion.tecnico_dni || null,
                gestion.tecnico_firma || null,
                gestion.order_image_path || null,
                gestion.nota_novedad || null,
                gestion.novedad_image_path || null,
                gestion.fecha_reagendada || null,
                gestion.turno_reagendamiento || null,
                gestion.latitude || null,
                gestion.longitude || null,
                gestion.timestamp,
                now
            ]
        );

        console.log(`DatabaseService: Saved gestion type=${gestion.tipo} ruta=${gestion.ruta_id} for OT=${gestion.ot} partida=${gestion.partida}`);
        return result.lastInsertRowId;
    }

    async getPendingGestiones(): Promise<GestionRecord[]> {
        const db = await this.getDb();
        return await db.getAllAsync("SELECT * FROM gestiones WHERE status = 'PENDING' ORDER BY created_at ASC");
    }

    async markGestionSynced(id: number): Promise<void> {
        const db = await this.getDb();
        await db.runAsync("UPDATE gestiones SET status = 'SYNCED' WHERE id = ?", [id]);
        console.log(`DatabaseService: Marked gestion ${id} as SYNCED`);
    }

    async getGestionByService(cita: string, ot: string, partida: number): Promise<GestionRecord | null> {
        const db = await this.getDb();
        const result = await db.getFirstAsync(
            "SELECT * FROM gestiones WHERE cita = ? AND ot = ? AND partida = ? ORDER BY created_at DESC LIMIT 1",
            [cita, ot, partida]
        );
        return result || null;
    }

    // =============== CLEANUP METHODS ===============

    async hasPendingGestiones(): Promise<boolean> {
        const db = await this.getDb();
        const result: any = await db.getFirstAsync("SELECT COUNT(*) as count FROM gestiones WHERE status = 'PENDING'");
        return result?.count > 0;
    }

    async clearSyncedGestiones(): Promise<number> {
        const db = await this.getDb();
        const result = await db.runAsync("DELETE FROM gestiones WHERE status = 'SYNCED'");
        console.log(`DatabaseService: Cleared ${result.changes} synced gestiones`);
        return result.changes;
    }

    async clearAllGestiones(): Promise<number> {
        const db = await this.getDb();
        const result = await db.runAsync("DELETE FROM gestiones");
        console.log(`DatabaseService: Cleared ALL ${result.changes} gestiones`);
        return result.changes;
    }

    async clearPendingImageUploads(): Promise<void> {
        const db = await this.getDb();
        await db.runAsync('DELETE FROM pending_image_uploads');
        console.log('DatabaseService: Cleared pending image uploads');
    }

    async getGestionesByRuta(rutaId: number): Promise<GestionRecord[]> {
        const db = await this.getDb();
        return await db.getAllAsync("SELECT * FROM gestiones WHERE ruta_id = ? ORDER BY created_at ASC", [rutaId]);
    }

    async clearGestionesNotInRuta(currentRutaId: number | null): Promise<number> {
        const db = await this.getDb();

        // If no current ruta, sync pending first then clear all
        if (currentRutaId === null || currentRutaId === 0) {
            const result = await db.runAsync("DELETE FROM gestiones WHERE status = 'SYNCED'");
            console.log(`DatabaseService: Cleared ${result.changes} synced gestiones (no active route)`);
            return result.changes;
        }

        // Clear gestiones from OTHER routes (only synced ones for safety)
        const result = await db.runAsync(
            "DELETE FROM gestiones WHERE ruta_id != ? AND status = 'SYNCED'",
            [currentRutaId]
        );
        console.log(`DatabaseService: Cleared ${result.changes} synced gestiones from other routes`);
        return result.changes;
    }

    // =============== PENDING IMAGE UPLOADS QUEUE ===============

    async addPendingImageUpload(
        gestionLocalId: number,
        gestionServerId: number,
        imagePath: string,
        imageType: string
    ): Promise<number> {
        const db = await this.getDb();
        const now = Date.now();

        const result = await db.runAsync(
            `INSERT INTO pending_image_uploads (
                gestion_local_id, gestion_server_id, image_path, image_type, created_at
            ) VALUES (?, ?, ?, ?, ?)`,
            [gestionLocalId, gestionServerId, imagePath, imageType, now]
        );

        console.log(`DatabaseService: Added pending image upload for gestion ${gestionServerId}, type ${imageType}`);
        return result.lastInsertRowId;
    }

    async getPendingImageUploads(): Promise<PendingImageUpload[]> {
        const db = await this.getDb();
        // Get uploads that haven't been uploaded yet, with less than 5 retries
        return await db.getAllAsync(
            `SELECT * FROM pending_image_uploads 
             WHERE uploaded_at IS NULL AND retry_count < 5 
             ORDER BY created_at ASC`
        );
    }

    async markImageUploaded(id: number): Promise<void> {
        const db = await this.getDb();
        const now = Date.now();
        await db.runAsync(
            'UPDATE pending_image_uploads SET uploaded_at = ? WHERE id = ?',
            [now, id]
        );
        console.log(`DatabaseService: Marked image upload ${id} as uploaded`);
    }

    async updateImageUploadError(id: number, error: string): Promise<void> {
        const db = await this.getDb();
        await db.runAsync(
            `UPDATE pending_image_uploads 
             SET retry_count = retry_count + 1, last_error = ? 
             WHERE id = ?`,
            [error, id]
        );
        console.log(`DatabaseService: Updated error for image upload ${id}: ${error}`);
    }

    async removePendingImageUpload(id: number): Promise<void> {
        const db = await this.getDb();
        await db.runAsync('DELETE FROM pending_image_uploads WHERE id = ?', [id]);
        console.log(`DatabaseService: Removed pending image upload ${id}`);
    }

    async getImageUploadsByGestionServerId(gestionServerId: number): Promise<PendingImageUpload[]> {
        const db = await this.getDb();
        return await db.getAllAsync(
            'SELECT * FROM pending_image_uploads WHERE gestion_server_id = ?',
            [gestionServerId]
        );
    }

    // ==================== STOCK LOCAL METHODS ====================

    async getStockLocal(): Promise<StockLocalItem[]> {
        const db = await this.getDb();
        return await db.getAllAsync('SELECT * FROM stock_local ORDER BY nombre_material');
    }

    async saveStockLocal(items: StockLocalItem[]): Promise<void> {
        const db = await this.getDb();
        // FIX #4: Atomic replace — only delete old stock AFTER successfully receiving new items.
        // This prevents leaving the technician with empty stock if the download was partial.
        if (items.length === 0) {
            // If server returned empty list, it likely means the technician has no stock.
            // Clear local cache to reflect server state.
            await db.runAsync('DELETE FROM stock_local');
            console.log('DatabaseService: Server returned empty stock — local stock cleared.');
            return;
        }

        // Build the INSERT first (all in one statement for atomicity)
        const placeholders = items.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const values: any[] = [];

        items.forEach(item => {
            values.push(
                item.codigo_material,
                item.nombre_material,
                item.unidad_medida,
                item.serie,
                item.cantidad,
                item.fecha_asignacion || new Date().toISOString(),
                item.condicion || 'BUENO',
                item.ubicacion_codigo || null
            );
        });

        // Only delete after we have the new data ready to insert
        await db.runAsync('DELETE FROM stock_local');
        await db.runAsync(
            `INSERT INTO stock_local (codigo_material, nombre_material, unidad_medida, serie, cantidad, fecha_asignacion, condicion, ubicacion_codigo) VALUES ${placeholders}`,
            values
        );
        console.log(`DatabaseService: Saved ${items.length} stock items`);
    }

    async updateStockLocal(codigoMaterial: string, serie: string | null, cantidad: number, tipo: 'add' | 'remove', condition?: string): Promise<void> {
        const db = await this.getDb();
        const cond = condition || 'BUENO';

        if (tipo === 'add') {
            // Try to find existing item
            let query = 'SELECT * FROM stock_local WHERE codigo_material = ? AND (serie = ? OR (serie IS NULL AND ? IS NULL))';
            let params = [codigoMaterial, serie, serie];

            // For non-serialized items, condition must match to merge
            if (!serie) {
                query += ' AND condicion = ?';
                params.push(cond);
            }

            const existing = await db.getFirstAsync(query, params);

            if (existing) {
                if (serie) {
                    // Serialized: quantity is always 1, only update condition to latest known state
                    await db.runAsync(
                        'UPDATE stock_local SET cantidad = 1, condicion = ? WHERE id = ?',
                        [cond, existing.id]
                    );
                } else {
                    // Non-serialized: accumulate quantity
                    await db.runAsync(
                        'UPDATE stock_local SET cantidad = cantidad + ?, condicion = ? WHERE id = ?',
                        [cantidad, cond, existing.id]
                    );
                }
            } else {
                // Look up material metadata for name and unidad_medida
                const materialInfo: any = await db.getFirstAsync(
                    'SELECT nombre, unidad_medida FROM metadata_materials WHERE codigo_material = ?',
                    [codigoMaterial]
                );
                const nombreMaterial = materialInfo?.nombre || codigoMaterial;
                const unidadMedida = materialInfo?.unidad_medida || 'UNIDAD';

                await db.runAsync(
                    `INSERT INTO stock_local (codigo_material, nombre_material, unidad_medida, serie, cantidad, fecha_asignacion, condicion) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [codigoMaterial, nombreMaterial, unidadMedida, serie, cantidad, new Date().toISOString(), cond]
                );
            }
        } else {
            // Remove
            let query = 'SELECT * FROM stock_local WHERE codigo_material = ? AND (serie = ? OR (serie IS NULL AND ? IS NULL))';
            let params = [codigoMaterial, serie, serie];

            // For non-serialized items, condition must match to decrease correct stock
            if (!serie) {
                query += ' AND condicion = ?';
                params.push(cond);
            }

            const existing = await db.getFirstAsync(query, params);

            if (existing) {
                const newCantidad = existing.cantidad - cantidad;
                if (newCantidad <= 0) {
                    await db.runAsync('DELETE FROM stock_local WHERE id = ?', [existing.id]);
                } else {
                    await db.runAsync('UPDATE stock_local SET cantidad = ? WHERE id = ?', [newCantidad, existing.id]);
                }
            }
        }
    }

    // Change condition of local stock item
    async changeCondicionLocal(codigoMaterial: string, serie: string | null, cantidad: number, nuevaCondicion: string, origenCondicion?: string): Promise<void> {
        const db = await this.getDb();

        // 1. Find source item
        let query = `SELECT * FROM stock_local WHERE codigo_material = ?`;
        let params: any[] = [codigoMaterial];

        if (origenCondicion) {
            query += ` AND condicion = ?`;
            params.push(origenCondicion);
        } else {
            query += ` AND condicion != ?`;
            params.push(nuevaCondicion);
        }

        if (serie) {
            query += ` AND serie = ?`;
            params.push(serie);
        } else {
            query += ` AND serie IS NULL AND cantidad >= ? LIMIT 1`;
            params.push(cantidad);
        }

        const sourceItem = await db.getFirstAsync(query, params);

        if (!sourceItem) {
            throw new Error(`No hay stock suficiente de ${codigoMaterial} para cambiar condición`);
        }

        // 2. Update/Move
        if (serie) {
            // Serialized: Update directly
            await db.runAsync(
                `UPDATE stock_local SET condicion = ? WHERE id = ?`,
                [nuevaCondicion, sourceItem.id]
            );
        } else {
            // Non-serialized: Split logic
            const newAmount = sourceItem.cantidad - cantidad;
            if (newAmount > 0) {
                await db.runAsync(
                    `UPDATE stock_local SET cantidad = ? WHERE id = ?`,
                    [newAmount, sourceItem.id]
                );
            } else {
                await db.runAsync(`DELETE FROM stock_local WHERE id = ?`, [sourceItem.id]);
            }

            // Increase/Create target
            const targetItem = await db.getFirstAsync(
                `SELECT * FROM stock_local WHERE codigo_material = ? AND serie IS NULL AND condicion = ?`,
                [codigoMaterial, nuevaCondicion]
            );

            if (targetItem) {
                await db.runAsync(
                    `UPDATE stock_local SET cantidad = cantidad + ? WHERE id = ?`,
                    [cantidad, targetItem.id]
                );
            } else {
                await db.runAsync(
                    `INSERT INTO stock_local (codigo_material, nombre_material, unidad_medida, serie, cantidad, fecha_asignacion, condicion, ubicacion_codigo)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        codigoMaterial, sourceItem.nombre_material, sourceItem.unidad_medida, null,
                        cantidad, new Date().toISOString(), nuevaCondicion, sourceItem.ubicacion_codigo
                    ]
                );
            }
        }
        console.log(`DatabaseService: Changed condition of ${codigoMaterial} to ${nuevaCondicion}`);
    }

    // ==================== MOVIMIENTOS PENDIENTES METHODS ====================

    async addMovimientoPendiente(mov: MovimientoPendiente): Promise<number> {
        const db = await this.getDb();
        // Generar UUID para deduplicación
        const uuid = mov.uuid || generateUUID();
        const result = await db.runAsync(
            `INSERT INTO movimientos_pendientes (uuid, codigo_material, serie, cantidad, tipo_movimiento, condicion, cita, ot, partida, foto_serie, fecha_hora, synced) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [uuid, mov.codigo_material, mov.serie, mov.cantidad, mov.tipo_movimiento, mov.condicion || null, mov.cita, mov.ot, mov.partida, mov.foto_serie || null, mov.fecha_hora]
        );
        console.log(`DatabaseService: Added pending movement ${mov.tipo_movimiento} for ${mov.codigo_material} (uuid: ${uuid})`);
        return result.lastInsertRowId;
    }

    async getMovimientosPendientes(): Promise<MovimientoPendiente[]> {
        const db = await this.getDb();
        return await db.getAllAsync('SELECT * FROM movimientos_pendientes WHERE synced = 0');
    }

    async markMovimientosSynced(ids: number[]): Promise<void> {
        if (ids.length === 0) return;
        const db = await this.getDb();
        const placeholders = ids.map(() => '?').join(',');
        await db.runAsync(
            `UPDATE movimientos_pendientes SET synced = 1 WHERE id IN (${placeholders})`,
            ids
        );
        console.log(`DatabaseService: Marked ${ids.length} movements as synced`);
    }

    async clearSyncedMovimientos(): Promise<void> {
        const db = await this.getDb();
        const result = await db.runAsync('DELETE FROM movimientos_pendientes WHERE synced = 1');
        console.log(`DatabaseService: Cleared ${result.changes} synced movements`);
    }

    // ==================== RUTA ACTIVA METHODS ====================

    async saveRutaActiva(ruta: any, servicios: any[]): Promise<void> {
        const db = await this.getDb();
        const now = Date.now();

        // Transaction removed to avoid 'cannot start a transaction within a transaction' error
        // Clear existing route data
        await db.runAsync('DELETE FROM ruta_activa');
        await db.runAsync('DELETE FROM ruta_servicios');

        // Save the route
        await db.runAsync(
            `INSERT INTO ruta_activa (id, tecnico_id, fecha, estado, total_servicios, ruta_json, cached_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                ruta.id,
                ruta.tecnico_id || null,
                ruta.fecha || null,
                ruta.estado || null,
                servicios.length,
                JSON.stringify(ruta),
                now
            ]
        );

        // Save all services
        for (const servicio of servicios) {
            await db.runAsync(
                `INSERT OR REPLACE INTO ruta_servicios (ruta_id, cita, ot, partida, servicio_json, cached_at) 
                    VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    ruta.id,
                    servicio.cita,
                    servicio.ot,
                    servicio.partida,
                    JSON.stringify(servicio),
                    now
                ]
            );
        }
    }

    async getRutaActiva(): Promise<{ ruta: any; cachedAt: number } | null> {
        const db = await this.getDb();
        const result: any = await db.getFirstAsync('SELECT * FROM ruta_activa LIMIT 1');

        if (!result) {
            return null;
        }

        try {
            const ruta = JSON.parse(result.ruta_json);
            return {
                ruta,
                cachedAt: result.cached_at
            };
        } catch (e) {
            console.error('DatabaseService: Error parsing ruta_json:', e);
            return null;
        }
    }

    async getServiciosRuta(rutaId: number): Promise<any[]> {
        const db = await this.getDb();
        const results: any[] = await db.getAllAsync(
            'SELECT servicio_json FROM ruta_servicios WHERE ruta_id = ?',
            [rutaId]
        );

        return results.map(r => {
            try {
                return JSON.parse(r.servicio_json);
            } catch (e) {
                console.error('DatabaseService: Error parsing servicio_json:', e);
                return null;
            }
        }).filter(s => s !== null);
    }

    async clearRutaActiva(): Promise<void> {
        const db = await this.getDb();
        await db.runAsync('DELETE FROM ruta_activa');
        await db.runAsync('DELETE FROM ruta_servicios');
        console.log('DatabaseService: Cleared ruta activa and servicios');
    }

    // ==================== TRANSFERENCIAS PENDIENTES METHODS ====================

    async saveTransferenciasPendientes(transferencias: any[]): Promise<void> {
        const db = await this.getDb();
        const now = Date.now();

        // Transaction removed to avoid 'cannot start a transaction within a transaction' error
        // Clear existing transfers
        await db.runAsync('DELETE FROM transferencias_pendientes');

        // Save each transfer
        for (const transfer of transferencias) {
            await db.runAsync(
                'INSERT INTO transferencias_pendientes (id, data_json, cached_at) VALUES (?, ?, ?)',
                [transfer.id, JSON.stringify(transfer), now]
            );
        }
    }

    async getTransferenciasPendientes(): Promise<any[]> {
        const db = await this.getDb();
        const results: any[] = await db.getAllAsync(
            'SELECT data_json FROM transferencias_pendientes ORDER BY id DESC'
        );

        return results.map(r => {
            try {
                return JSON.parse(r.data_json);
            } catch (e) {
                console.error('DatabaseService: Error parsing transfer json:', e);
                return null;
            }
        }).filter(t => t !== null);
    }

    async clearTransferenciasPendientes(): Promise<void> {
        const db = await this.getDb();
        await db.runAsync('DELETE FROM transferencias_pendientes');
        console.log('DatabaseService: Cleared pending transfers');
    }

    // ==================== UBICACIONES TRACKING METHODS ====================

    async saveUbicacion(ubicacion: UbicacionTracking): Promise<void> {
        const db = await this.getDb();
        await db.runAsync(
            `INSERT INTO ubicaciones_tracking (ruta_id, latitud, longitud, precision, tipo_registro, fecha_hora, synced)
             VALUES (?, ?, ?, ?, ?, ?, 0)`,
            [
                ubicacion.ruta_id,
                ubicacion.latitud,
                ubicacion.longitud,
                ubicacion.precision,
                ubicacion.tipo_registro,
                ubicacion.fecha_hora
            ]
        );
        console.log(`DatabaseService: Saved ubicacion ${ubicacion.tipo_registro} for ruta ${ubicacion.ruta_id}`);
    }

    async getPendingUbicaciones(): Promise<UbicacionTracking[]> {
        const db = await this.getDb();
        return await db.getAllAsync('SELECT * FROM ubicaciones_tracking WHERE synced = 0 ORDER BY fecha_hora ASC');
    }

    async markUbicacionesSynced(ids: number[]): Promise<void> {
        if (ids.length === 0) return;
        const db = await this.getDb();
        const placeholders = ids.map(() => '?').join(',');
        await db.runAsync(
            `UPDATE ubicaciones_tracking SET synced = 1 WHERE id IN (${placeholders})`,
            ids
        );
        console.log(`DatabaseService: Marked ${ids.length} ubicaciones as synced`);
    }

    async clearUbicaciones(): Promise<void> {
        const db = await this.getDb();
        // Delete synced locations only, essentially. Or all?
        // Plan says: "Limpiar al recibir nueva ruta". Usually we clear everything for the new route.
        // But maybe we should keep synced ones for history if needed?
        // For now, let's clear ALL as per plan "Limpiar tabla local de ubicaciones de la ruta anterior"
        const result = await db.runAsync('DELETE FROM ubicaciones_tracking');
        console.log(`DatabaseService: Cleared ${result.changes} ubicaciones`);
    }

    // ==================== CREDENTIAL PHOTO METHODS ====================

    async saveCredentialPhoto(photo: string, hash: string): Promise<void> {
        const db = await this.getDb();
        const now = Date.now();

        // Check if profile exists
        const existing = await db.getFirstAsync('SELECT id FROM technician_profile WHERE id = 1');

        if (existing) {
            await db.runAsync(
                'UPDATE technician_profile SET credential_photo = ?, credential_hash = ?, updated_at = ? WHERE id = 1',
                [photo, hash, now]
            );
        } else {
            await db.runAsync(
                'INSERT INTO technician_profile (id, credential_photo, credential_hash, updated_at) VALUES (1, ?, ?, ?)',
                [photo, hash, now]
            );
        }
        console.log('DatabaseService: Saved credential photo');
    }

    async getCredentialPhoto(): Promise<{ photo: string | null; hash: string | null }> {
        const db = await this.getDb();
        const result: any = await db.getFirstAsync(
            'SELECT credential_photo, credential_hash FROM technician_profile WHERE id = 1'
        );
        return {
            photo: result?.credential_photo || null,
            hash: result?.credential_hash || null
        };
    }

    // ==================== APP NOTIFICACIONES METHODS ====================

    async saveAppNotificaciones(items: AppNotificacion[]): Promise<void> {
        const db = await this.getDb();
        const now = Date.now();
        await db.runAsync('DELETE FROM app_notificaciones');
        for (const n of items) {
            await db.runAsync(
                `INSERT INTO app_notificaciones
                 (id, tipo_incidente, producto, campania, mensaje, prioridad, fecha_inicio, fecha_fin, cached_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [n.id, n.tipo_incidente || '', n.producto || '', n.campania || '',
                n.mensaje, n.prioridad || 'info', n.fecha_inicio || null, n.fecha_fin || null, now]
            );
        }
        console.log(`DatabaseService: Saved ${items.length} app notifications`);
    }

    async getAppNotificaciones(): Promise<AppNotificacion[]> {
        const db = await this.getDb();
        const rows: any[] = await db.getAllAsync('SELECT * FROM app_notificaciones');
        return rows.map(r => ({
            id: r.id,
            tipo_incidente: r.tipo_incidente || '',
            producto: r.producto || '',
            campania: r.campania || '',
            mensaje: r.mensaje,
            prioridad: r.prioridad as 'critico' | 'importante' | 'info',
            fecha_inicio: r.fecha_inicio,
            fecha_fin: r.fecha_fin
        }));
    }

    async clearAppNotificaciones(): Promise<void> {
        const db = await this.getDb();
        await db.runAsync('DELETE FROM app_notificaciones');
    }

    async savePlantillasMaterial(plantillas: any[]): Promise<void> {
        const db = await this.getDb();
        await db.runAsync('DELETE FROM plantillas_material_items');
        await db.runAsync('DELETE FROM plantillas_material');
        console.log(`DatabaseService: Saving ${plantillas.length} plantillas_material to SQLite`);
        let savedCount = 0;
        for (const p of plantillas) {
            try {
                await db.runAsync(
                    'INSERT INTO plantillas_material (id, nombre, tipo_incidente, tipo_cierre, producto) VALUES (?, ?, ?, ?, ?)',
                    [p.id, p.nombre, p.tipo_incidente ?? null, p.tipo_cierre ?? null, p.producto ?? null]
                );
                let itemCount = 0;
                for (const it of (p.items || [])) {
                    await db.runAsync(
                        'INSERT INTO plantillas_material_items (id, plantilla_id, tipo, codigo_material, nombre_material, unidad_medida, cantidad, orden) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [it.id, p.id, it.tipo, it.codigo_material ?? null, it.nombre_material ?? null, it.unidad_medida ?? null, it.cantidad ?? null, it.orden ?? 0]
                    );
                    itemCount++;
                }
                console.log(`DatabaseService: Saved plantilla id=${p.id} "${p.nombre}" with ${itemCount} items`);
                savedCount++;
            } catch (e) {
                console.error(`DatabaseService: ERROR saving plantilla id=${p.id} "${p.nombre}": ${e}`);
            }
        }
        console.log(`DatabaseService: Done — ${savedCount}/${plantillas.length} plantillas saved`);
    }

    async saveSyncLog(entry: SyncLogEntry): Promise<void> {
        const db = await this.getDb();
        await db.runAsync(
            `INSERT INTO sync_log (timestamp, success, upload_success, download_success,
             movimientos_enviados, gestiones_enviadas, error_detalle, duracion_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                entry.timestamp,
                entry.success,
                entry.upload_success,
                entry.download_success,
                entry.movimientos_enviados,
                entry.gestiones_enviadas,
                entry.error_detalle ?? null,
                entry.duracion_ms,
            ]
        );
        // Keep only last 50 entries to avoid unbounded growth
        await db.execAsync(
            `DELETE FROM sync_log WHERE id NOT IN (SELECT id FROM sync_log ORDER BY id DESC LIMIT 50)`
        );
    }

    async getOrCreateStockBatchId(): Promise<string> {
        const db = await this.getDb();
        const row: any = await db.getFirstAsync(
            `SELECT value FROM app_settings WHERE key = 'stock_batch_id'`
        );
        if (row?.value) return row.value;
        // Generate and persist a new UUID
        const bytes = new Uint8Array(16);
        for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        const uuid = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
        await db.runAsync(
            `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('stock_batch_id', ?)`,
            [uuid]
        );
        console.log(`DatabaseService: Created new stock_batch_id: ${uuid}`);
        return uuid;
    }

    async clearStockBatchId(): Promise<void> {
        const db = await this.getDb();
        await db.runAsync(`DELETE FROM app_settings WHERE key = 'stock_batch_id'`);
        console.log('DatabaseService: Cleared stock_batch_id');
    }

    async saveServiceDraft(key: string, payload: any): Promise<void> {
        const db = await this.getDb();
        await db.runAsync(
            `INSERT OR REPLACE INTO workflow_drafts (key, payload, updated_at) VALUES (?, ?, ?)`,
            [key, JSON.stringify(payload), Date.now()]
        );
    }

    async getServiceDraft(key: string): Promise<any | null> {
        const db = await this.getDb();
        const row: any = await db.getFirstAsync(
            `SELECT payload FROM workflow_drafts WHERE key = ?`,
            [key]
        );
        if (!row?.payload) return null;
        try {
            return JSON.parse(row.payload);
        } catch (error) {
            console.warn('DatabaseService: Invalid service draft, deleting it', error);
            await this.deleteServiceDraft(key);
            return null;
        }
    }

    async deleteServiceDraft(key: string): Promise<void> {
        const db = await this.getDb();
        await db.runAsync(`DELETE FROM workflow_drafts WHERE key = ?`, [key]);
    }

    async getLastSyncLogs(limit: number = 10): Promise<SyncLogEntry[]> {
        const db = await this.getDb();
        return await db.getAllAsync(
            `SELECT * FROM sync_log ORDER BY id DESC LIMIT ?`,
            [limit]
        ) as SyncLogEntry[];
    }

    async getPlantillasMaterial(tipo_incidente?: string, tipo_cierre?: string): Promise<any[]> {
        const db = await this.getDb();
        let query = `SELECT * FROM plantillas_material WHERE 1=1`;
        const params: any[] = [];
        if (tipo_incidente) {
            query += ` AND (tipo_incidente = ? OR tipo_incidente IS NULL)`;
            params.push(tipo_incidente);
        }
        if (tipo_cierre) {
            query += ` AND (tipo_cierre = ? OR tipo_cierre IS NULL)`;
            params.push(tipo_cierre);
        }
        const plantillas: any[] = await db.getAllAsync(query, params);
        console.log(`[DB] getPlantillasMaterial => ${plantillas.length} plantillas en SQLite`, plantillas.map(p => ({ id: p.id, nombre: p.nombre, ti: p.tipo_incidente, tc: p.tipo_cierre, prod: p.producto })));
        for (const p of plantillas) {
            p.items = await db.getAllAsync(
                'SELECT * FROM plantillas_material_items WHERE plantilla_id = ? ORDER BY tipo, orden',
                [p.id]
            );
        }
        return plantillas;
    }
}

// Singleton instance
let databaseServiceInstance: DatabaseService | null = null;

// Factory function - no SQLite parameter needed on native
export const createDatabaseService = (): DatabaseService => {
    if (!databaseServiceInstance) {
        databaseServiceInstance = new DatabaseServiceImpl();
    }
    return databaseServiceInstance;
};

export const getDatabaseService = (): DatabaseService | null => {
    return databaseServiceInstance;
};

export const dbService = new DatabaseServiceImpl();
