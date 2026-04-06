import { useState, useCallback, useEffect } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { Camera } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';

export interface PermissionStatus {
    name: string;
    label: string;
    icon: string;
    granted: boolean;
}

export function useAppPermissions() {
    const [allGranted, setAllGranted] = useState<boolean>(false);
    const [permissions, setPermissions] = useState<PermissionStatus[]>([]);
    const [isChecking, setIsChecking] = useState<boolean>(true);
    // Only block the UI on the very first check, not on background rechecks
    const [initialCheckDone, setInitialCheckDone] = useState<boolean>(false);

    const checkPermissions = useCallback(async (requestIfNotGranted: boolean = false) => {
        setIsChecking(true);
        try {
            // 1. Camera
            let cameraStatus = await Camera.getCameraPermissionsAsync();
            if (requestIfNotGranted && !cameraStatus.granted && cameraStatus.canAskAgain) {
                cameraStatus = await Camera.requestCameraPermissionsAsync();
            }

            // 2. Media Library (Photos only, writeOnly avoids the undeclared AUDIO permission)
            let mediaStatus = await MediaLibrary.getPermissionsAsync(true);
            if (requestIfNotGranted && !mediaStatus.granted && mediaStatus.canAskAgain) {
                mediaStatus = await MediaLibrary.requestPermissionsAsync(true);
            }

            // 3. Notifications (may fail on Expo Go SDK 53+ - treat as optional)
            let notifGranted = true;
            try {
                let notifStatus = await Notifications.getPermissionsAsync();
                if (requestIfNotGranted && !notifStatus.granted && notifStatus.canAskAgain) {
                    notifStatus = await Notifications.requestPermissionsAsync();
                }
                notifGranted = notifStatus.granted;
            } catch (_e) {
                // expo-notifications not supported in Expo Go SDK 53+; skip gracefully
                notifGranted = true;
            }

            // 4. Location (Foreground and Background)
            let fgLocationStatus = await Location.getForegroundPermissionsAsync();
            if (requestIfNotGranted && !fgLocationStatus.granted && fgLocationStatus.canAskAgain) {
                fgLocationStatus = await Location.requestForegroundPermissionsAsync();
            }

            // Foreground location is required before background location can be requested
            let locationGranted = fgLocationStatus.granted;

            if (locationGranted && Platform.OS !== 'web') {
                let bgLocationStatus = await Location.getBackgroundPermissionsAsync();
                if (requestIfNotGranted && !bgLocationStatus.granted && bgLocationStatus.canAskAgain) {
                    bgLocationStatus = await Location.requestBackgroundPermissionsAsync();
                }
                // Require both for full location grant
                locationGranted = fgLocationStatus.granted && bgLocationStatus.granted;
            }

            const currentPermissions: PermissionStatus[] = [
                {
                    name: 'camera',
                    label: 'Cámara',
                    icon: 'camera-outline',
                    granted: cameraStatus.granted,
                },
                {
                    name: 'media',
                    label: 'Fotos y Videos',
                    icon: 'images-outline',
                    granted: mediaStatus.granted,
                },
                {
                    name: 'notifications',
                    label: 'Notificaciones',
                    icon: 'notifications-outline',
                    granted: notifGranted,
                },
                {
                    name: 'location',
                    label: 'Ubicación (Siempre)',
                    icon: 'location-outline',
                    granted: locationGranted,
                },
            ];

            setPermissions(currentPermissions);
            setAllGranted(currentPermissions.every((p) => p.granted));
        } catch (error) {
            console.error('Error checking permissions:', error);
            setAllGranted(false);
        } finally {
            setIsChecking(false);
            setInitialCheckDone(true);
        }
    }, []);

    // Initial check and request on mount
    useEffect(() => {
        checkPermissions(true);
    }, [checkPermissions]);

    // Re-check when app comes to foreground (e.g. returning from settings)
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active' && initialCheckDone) {
                // Re-check silently without setting isChecking=true (avoids unmounting the Stack)
                checkPermissions(false);
            }
        });

        return () => {
            subscription.remove();
        };
    }, [checkPermissions, initialCheckDone]);

    return {
        allGranted,
        permissions,
        // Only block during the initial check, never during background rechecks
        isChecking: isChecking && !initialCheckDone,
        recheckPermissions: () => checkPermissions(false),
        requestPermissions: () => checkPermissions(true),
    };
}
