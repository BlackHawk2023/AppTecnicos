import api from './api.service';
import { Storage } from '../utils/storage';
import { Alert } from 'react-native';

// Interfaces based on mobile_schemas.py

export interface TecnicoInfo {
    usuario: string;
    nombre_completo: string;
    perfil: string;
    zona: string;
    is_active: boolean;
}

export interface MobileTokenResponse {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    tecnico: TecnicoInfo;
}

export interface LoginApiResponse {
    success: boolean;
    message: string;
    data: MobileTokenResponse;
}

export const AuthService = {
    login: async (usuario: string, password: string): Promise<LoginApiResponse | null> => {
        try {
            // The mobile/auth/login endpoint expects JSON, not FormData
            // And the field is "usuario", not "username"
            const payload = {
                usuario: usuario,
                password: password
            };

            const response = await api.post<LoginApiResponse>('/mobile/auth/login', payload);

            if (response.data?.success && response.data?.data?.access_token) {
                const tokenData = response.data.data;
                await Storage.setItem('user_token', tokenData.access_token);
                // We store the full tecnico object for profile usage
                await Storage.setItem('user_info', JSON.stringify(tokenData.tecnico));

                // Save credentials for auto-login (always save for convenience)
                await Storage.setItem('saved_username', usuario);
                await Storage.setItem('saved_password', password);

                // Return the full response for consistency/debugging
                return response.data;
            }
            return null;
        } catch (error: any) {
            console.error('Login error:', error.response?.data || error.message);
            throw error;
        }
    },

    logout: async () => {
        await Storage.deleteItem('user_token');
        await Storage.deleteItem('user_info');
        // Note: We do NOT delete saved credentials on logout
        // User can clear app data if they want to remove them
    },

    getUser: async () => {
        const user = await Storage.getItem('user_info');
        return user ? JSON.parse(user) : null;
    },

    getToken: async () => {
        return await Storage.getItem('user_token');
    },

    // Get saved credentials for auto-fill
    getSavedCredentials: async (): Promise<{ username: string; password: string } | null> => {
        const username = await Storage.getItem('saved_username');
        const password = await Storage.getItem('saved_password');
        if (username && password) {
            return { username, password };
        }
        return null;
    },

    // Clear saved credentials (if user wants to forget them)
    clearSavedCredentials: async () => {
        await Storage.deleteItem('saved_username');
        await Storage.deleteItem('saved_password');
    }
};
