import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthService } from '../services/auth.service';
import { useRouter, useSegments } from 'expo-router';

interface AuthContextType {
    user: any | null;
    isLoading: boolean;
    signIn: (u: string, p: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    isLoading: false,
    signIn: async () => { },
    signOut: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const segments = useSegments();

    // Check for existing session on mount
    useEffect(() => {
        const checkUser = async () => {
            try {
                const userInfo = await AuthService.getUser();
                if (userInfo) {
                    setUser(userInfo);
                }
            } catch (e) {
                console.log('Error checking user session', e);
            } finally {
                setIsLoading(false);
            }
        };
        checkUser();
    }, []);

    // Handle navigation based on auth state
    useEffect(() => {
        if (isLoading) return;

        const firstSegment = String(segments[0] || '');
        const inAuthGroup = firstSegment === '(tabs)';
        // firstSegment es '' exactamente cuando no hay segmentos (segments.length === 0)
        const isOnLoginPage = firstSegment === '' || firstSegment === 'index';
        const isOnProtectedRoute = firstSegment === 'detalle' || firstSegment === 'ruta' || inAuthGroup;

        if (!user && isOnProtectedRoute) {
            router.replace('/');
        } else if (user && isOnLoginPage) {
            router.replace('/(tabs)/home');
        }
    }, [user, segments, isLoading]);

    const signIn = async (u: string, p: string) => {
        setIsLoading(true);
        try {
            const resp = await AuthService.login(u, p);
            if (resp && resp.data && resp.data.tecnico) {
                setUser(resp.data.tecnico);

                // Sync metadata after successful login
                try {
                    const { syncService } = await import('../services/sync.service');
                    await syncService.syncMetadata();
                    console.log('Sync completed after login');
                } catch (syncError) {
                    console.log('Sync failed after login, will retry later:', syncError);
                }
            }
        } catch (error) {
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const signOut = async () => {
        try {
            await AuthService.logout();
        } catch (e) {
            console.log('Logout error', e);
        }
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};
