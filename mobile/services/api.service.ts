import axios, { AxiosInstance } from 'axios';
import { Storage } from '../utils/storage';
import { Platform } from 'react-native';
import { ServerConfigService } from './serverConfig.service';

// Create axios instance without base URL (will be set dynamically)
const api: AxiosInstance = axios.create({
    timeout: 30000,  // Increased timeout for image uploads
    headers: {
        'Content-Type': 'application/json',
    },
});

// Flag to track if API is initialized
let isInitialized = false;

/**
 * Initialize the API with the configured server URL
 * Must be called before making any API requests
 */
export const initializeApi = async (): Promise<boolean> => {
    try {
        const baseUrl = await ServerConfigService.getApiBaseUrl();
        if (!baseUrl) {
            console.log('API: No server URL configured');
            return false;
        }

        api.defaults.baseURL = baseUrl;
        isInitialized = true;
        console.log('API: Initialized with base URL:', baseUrl);
        return true;
    } catch (error) {
        console.error('API: Error initializing:', error);
        return false;
    }
};

/**
 * Check if API is initialized
 */
export const isApiInitialized = (): boolean => {
    return isInitialized && !!api.defaults.baseURL;
};

/**
 * Reset API configuration (call when changing server URL)
 */
export const resetApi = (): void => {
    api.defaults.baseURL = undefined;
    isInitialized = false;
    ServerConfigService.clearCache();
    console.log('API: Configuration reset');
};

/**
 * Get fallback URL for development
 */
const getDevBaseUrl = (): string => {
    if (Platform.OS === 'web') {
        return 'http://localhost:8000/api/v1';
    }
    // Android Emulator
    if (Platform.OS === 'android') {
        return 'http://10.0.2.2:8000/api/v1';
    }
    // iOS Simulator / Physical Device
    return 'http://192.168.1.5:8000/api/v1';
};

// Interceptor para agregar el token y verificar inicialización
api.interceptors.request.use(
    async (config) => {
        // If not initialized, try to initialize or use dev URL
        if (!config.baseURL) {
            const baseUrl = await ServerConfigService.getApiBaseUrl();
            if (baseUrl) {
                config.baseURL = baseUrl;
            } else if (__DEV__) {
                // In development, use fallback URL
                config.baseURL = getDevBaseUrl();
                console.log('API: Using development fallback URL');
            }
        }

        try {
            const token = await Storage.getItem('user_token');
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        } catch (error) {
            console.error('Error reading token', error);
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

// Interceptor para manejar errores (401, etc) y auto-refresh token
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // If 401 error and we haven't tried to refresh yet for this request
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            // Prevent multiple simultaneous refresh attempts
            if (!isRefreshing) {
                isRefreshing = true;
                refreshPromise = attemptTokenRefresh();
            }

            try {
                const success = await refreshPromise;
                if (success) {
                    // Retry the original request with new token
                    const newToken = await Storage.getItem('user_token');
                    if (newToken) {
                        originalRequest.headers.Authorization = `Bearer ${newToken}`;
                        return api(originalRequest);
                    }
                }
            } catch (refreshError) {
                console.log('Token refresh failed:', refreshError);
            } finally {
                isRefreshing = false;
                refreshPromise = null;
            }

            // If we get here, refresh failed - clear token
            await Storage.deleteItem('user_token');
        }
        return Promise.reject(error);
    }
);

// Attempt to refresh token using saved credentials
async function attemptTokenRefresh(): Promise<boolean> {
    try {
        // Import AuthService dynamically to avoid circular dependencies
        const { AuthService } = await import('./auth.service');
        const credentials = await AuthService.getSavedCredentials();

        if (!credentials) {
            console.log('No saved credentials for token refresh');
            return false;
        }

        console.log('Attempting token refresh with saved credentials...');
        const result = await AuthService.login(credentials.username, credentials.password);

        if (result?.data?.access_token) {
            console.log('Token refresh successful');
            return true;
        }

        console.log('Token refresh failed - invalid response');
        return false;
    } catch (error) {
        console.log('Token refresh error:', error);
        return false;
    }
}

export default api;
