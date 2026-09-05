import { Ionicons } from '@expo/vector-icons';
import { CameraView, CameraViewProps } from 'expo-camera';
import React, { forwardRef, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default forwardRef<CameraView, CameraViewProps>(function ScannerCamera(
    { style, onBarcodeScanned, children, ...props }, ref,
) {
    const [zoom, setZoom] = useState(0);
    const [torch, setTorch] = useState(false);
    const scanned = useRef(false);

    return (
        <View style={style}>
            <CameraView {...props} ref={ref} style={StyleSheet.absoluteFillObject}
                zoom={zoom} enableTorch={torch}
                onBarcodeScanned={onBarcodeScanned && (result => {
                    if (scanned.current) return;
                    scanned.current = true;
                    onBarcodeScanned(result);
                })}
            />
            {children}
            <View style={styles.controls}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reducir zoom"
                    accessibilityState={{ disabled: zoom === 0 }} disabled={zoom === 0}
                    style={[styles.button, zoom === 0 && styles.disabled]}
                    onPress={() => setZoom(value => Math.max(0, Math.round((value - 0.1) * 10) / 10))}>
                    <Ionicons name="remove" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.label}>Zoom {Math.round(zoom * 100)}%</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Aumentar zoom"
                    accessibilityState={{ disabled: zoom === 1 }} disabled={zoom === 1}
                    style={[styles.button, zoom === 1 && styles.disabled]}
                    onPress={() => setZoom(value => Math.min(1, Math.round((value + 0.1) * 10) / 10))}>
                    <Ionicons name="add" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button"
                    accessibilityLabel={torch ? 'Apagar linterna' : 'Encender linterna'}
                    accessibilityState={{ selected: torch }} style={styles.button}
                    onPress={() => setTorch(value => !value)}>
                    <Ionicons name={torch ? 'flash' : 'flash-off'} size={24} color={torch ? '#ffd54f' : '#fff'} />
                </TouchableOpacity>
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    controls: { position: 'absolute', bottom: 24, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 12, padding: 4, gap: 4 },
    button: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    disabled: { opacity: 0.4 },
    label: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
