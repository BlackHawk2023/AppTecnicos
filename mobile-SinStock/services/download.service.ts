/**
 * download.service.ts
 *
 * Servicio de descargas resiliente con soporte de pausa y reanudación.
 * Usa `createDownloadResumable` de expo-file-system para:
 *  - Seguimiento de progreso en tiempo real
 *  - Guardar el estado de descarga en AsyncStorage
 *  - Reanudar automáticamente tras un corte de red o reinicio de la app
 */
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@download_states';

interface SavedState {
    url: string;
    fileUri: string;
    resumeData?: string;
}

export type ProgressCallback = (progress: number) => void; // 0-1

class DownloadService {
    /** Descargas activas en esta sesión */
    private active = new Map<string, FileSystem.DownloadResumable>();

    /**
     * Descarga un archivo con soporte de reanudación.
     * Si existía una descarga previa interrumpida, la reanuda desde donde quedó.
     *
     * @param downloadId   Clave única (ej: "guia-3-pdf")
     * @param url          URL completa del archivo
     * @param filename     Nombre de archivo local (sin ruta)
     * @param token        JWT del técnico (para header Authorization)
     * @param onProgress   Callback con progreso 0→1
     * @returns            URI local del archivo descargado
     */
    async download(
        downloadId: string,
        url: string,
        filename: string,
        token: string | null,
        onProgress: ProgressCallback
    ): Promise<string> {
        const localUri = `${FileSystem.documentDirectory}${filename}`;

        // Si el archivo ya existe y tiene contenido, lo devolvemos directamente
        const info = await FileSystem.getInfoAsync(localUri);
        if (info.exists && (info as any).size > 0) {
            onProgress(1);
            return localUri;
        }

        // Recuperar estado guardado de descarga previa interrumpida
        const saved = await this._loadState(downloadId);

        const headers: Record<string, string> = token
            ? { Authorization: `Bearer ${token}` }
            : {};

        const progressCallback = (data: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
            if (data.totalBytesExpectedToWrite > 0) {
                onProgress(data.totalBytesWritten / data.totalBytesExpectedToWrite);
            }
        };

        let resumable: FileSystem.DownloadResumable;

        if (saved?.resumeData) {
            // Reanudar descarga interrumpida usando el snapshot guardado
            console.log(`DownloadService: Resuming download ${downloadId} from saved state`);
            resumable = FileSystem.createDownloadResumable(
                saved.url,
                saved.fileUri,
                { headers },
                progressCallback,
                saved.resumeData
            );
        } else {
            // Descarga nueva
            console.log(`DownloadService: Starting new download ${downloadId}`);
            resumable = FileSystem.createDownloadResumable(
                url,
                localUri,
                { headers },
                progressCallback
            );
        }

        this.active.set(downloadId, resumable);

        // Guardamos el estado inicial ANTES de iniciar (para sobrevivir un crash de la app)
        await this._saveState(downloadId, { url, fileUri: localUri });

        try {
            const result = await resumable.downloadAsync();

            if (result?.uri) {
                await this._clearState(downloadId);
                this.active.delete(downloadId);
                onProgress(1);
                console.log(`DownloadService: Completed ${downloadId} → ${result.uri}`);
                return result.uri;
            }

            throw new Error('La descarga no retornó un archivo válido');
        } catch (error: any) {
            console.error(`DownloadService: Error on ${downloadId}:`, error.message);

            // Intentar pausar y guardar el estado para poder reanudar
            try {
                const snapshot = await resumable.pauseAsync();
                if (snapshot?.resumeData) {
                    await this._saveState(downloadId, {
                        url: snapshot.url,
                        fileUri: snapshot.fileUri,
                        resumeData: snapshot.resumeData,
                    });
                    console.log(`DownloadService: Saved resume state for ${downloadId}`);
                }
            } catch (pauseErr) {
                console.warn(`DownloadService: Could not save resume state for ${downloadId}:`, pauseErr);
            }

            this.active.delete(downloadId);
            throw error; // Relanzar para que el componente muestre el error
        }
    }

    /** Cancelar y limpiar una descarga activa */
    async cancel(downloadId: string): Promise<void> {
        const resumable = this.active.get(downloadId);
        if (resumable) {
            try { await resumable.pauseAsync(); } catch { }
            this.active.delete(downloadId);
        }
        await this._clearState(downloadId);
    }

    /** True si hay una descarga activa en esta sesión */
    isActive(downloadId: string): boolean {
        return this.active.has(downloadId);
    }

    /** True si hay estado guardado para reanudar (incluso tras reinicio de la app) */
    async hasResumableState(downloadId: string): Promise<boolean> {
        const state = await this._loadState(downloadId);
        return !!state?.resumeData;
    }

    // ── AsyncStorage helpers ──────────────────────────────────────────────────

    private async _saveState(id: string, state: SavedState): Promise<void> {
        try {
            const all = await this._readAll();
            all[id] = state;
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        } catch (e) {
            console.error('DownloadService: Error saving state', e);
        }
    }

    private async _loadState(id: string): Promise<SavedState | null> {
        try {
            const all = await this._readAll();
            return all[id] ?? null;
        } catch {
            return null;
        }
    }

    private async _clearState(id: string): Promise<void> {
        try {
            const all = await this._readAll();
            delete all[id];
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        } catch { }
    }

    private async _readAll(): Promise<Record<string, SavedState>> {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        return json ? JSON.parse(json) : {};
    }
}

export const downloadService = new DownloadService();
