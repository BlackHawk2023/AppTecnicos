/**
 * Server Configuration Service
 * Manages the backend server URL for production deployment
 */
import { Storage } from '../utils/storage';
import axios from 'axios';

const SERVER_URL_KEY = 'server_url';

class ServerConfigServiceClass {
    private cachedUrl: string | null = null;

    /**
     * Get the configured server URL
     */
    async getServerUrl(): Promise<string | null> {
        if (this.cachedUrl) {
            return this.cachedUrl;
        }

        try {
            const url = await Storage.getItem(SERVER_URL_KEY);
            if (url) {
                this.cachedUrl = url;
            }
            return url;
        } catch (error) {
            console.error('ServerConfigService: Error reading server URL:', error);
            return null;
        }
    }

    /**
     * Set the server URL
     */
    async setServerUrl(url: string): Promise<void> {
        // Normalize URL - remove trailing slash
        const normalizedUrl = url.replace(/\/+$/, '');

        await Storage.setItem(SERVER_URL_KEY, normalizedUrl);
        this.cachedUrl = normalizedUrl;

        console.log('ServerConfigService: Server URL saved:', normalizedUrl);
    }

    /**
     * Clear the server URL
     */
    async clearServerUrl(): Promise<void> {
        await Storage.deleteItem(SERVER_URL_KEY);
        this.cachedUrl = null;
    }

    /**
     * Check if server URL is configured
     */
    async isConfigured(): Promise<boolean> {
        const url = await this.getServerUrl();
        return !!url;
    }

    /**
     * Test connection to a server URL
     * Returns { success: boolean, message: string }
     */
    async testConnection(url: string): Promise<{ success: boolean; message: string }> {
        // Normalize URL
        const normalizedUrl = url.replace(/\/+$/, '');

        try {
            console.log('ServerConfigService: Testing connection to:', normalizedUrl);

            // Try to hit the health endpoint
            const response = await axios.get(`${normalizedUrl}/health`, {
                timeout: 10000,
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.status === 200) {
                console.log('ServerConfigService: Connection successful');
                return {
                    success: true,
                    message: 'Conexión exitosa'
                };
            }

            return {
                success: false,
                message: `Respuesta inesperada: ${response.status}`
            };
        } catch (error: any) {
            console.error('ServerConfigService: Connection test failed:', error);

            if (error.code === 'ECONNREFUSED') {
                return {
                    success: false,
                    message: 'No se puede conectar al servidor'
                };
            }

            if (error.code === 'ENOTFOUND' || error.message.includes('Network Error')) {
                return {
                    success: false,
                    message: 'Servidor no encontrado. Verifica la URL.'
                };
            }

            if (error.response?.status === 404) {
                return {
                    success: false,
                    message: 'Endpoint no encontrado. Verifica la URL del servidor.'
                };
            }

            return {
                success: false,
                message: error.message || 'Error de conexión desconocido'
            };
        }
    }

    /**
     * Get the full API base URL (server URL + /api/v1)
     */
    async getApiBaseUrl(): Promise<string | null> {
        const serverUrl = await this.getServerUrl();
        if (!serverUrl) return null;
        return `${serverUrl}/api/v1`;
    }

    /**
     * Clear cache (call this when URL might have changed)
     */
    clearCache(): void {
        this.cachedUrl = null;
    }
}

export const ServerConfigService = new ServerConfigServiceClass();
