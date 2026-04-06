import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TextSize = 'CHICO' | 'MEDIANO' | 'GRANDE';

interface TextSizeContextProps {
    textSize: TextSize;
    textScale: number;
    setTextSize: (size: TextSize) => Promise<void>;
}

const TextSizeContext = createContext<TextSizeContextProps>({
    textSize: 'MEDIANO',
    textScale: 1.0,
    setTextSize: async () => { },
});

export const useTextSize = () => useContext(TextSizeContext);

export const TextSizeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [textSize, setTextSizeState] = useState<TextSize>('MEDIANO');
    const [textScale, setTextScale] = useState(1.0);

    const getScale = (size: TextSize) => {
        switch (size) {
            case 'CHICO': return 0.85;
            case 'MEDIANO': return 1.0;
            case 'GRANDE': return 1.15;
            default: return 1.0;
        }
    };

    useEffect(() => {
        loadTextSize();
    }, []);

    const loadTextSize = async () => {
        try {
            const savedSize = await AsyncStorage.getItem('text_size_preference');
            if (savedSize) {
                const size = savedSize as TextSize;
                setTextSizeState(size);
                setTextScale(getScale(size));
            }
        } catch (error) {
            console.error('Error loading text size preference:', error);
        }
    };

    const setTextSize = async (size: TextSize) => {
        try {
            await AsyncStorage.setItem('text_size_preference', size);
            setTextSizeState(size);
            setTextScale(getScale(size));
        } catch (error) {
            console.error('Error saving text size preference:', error);
        }
    };

    return (
        <TextSizeContext.Provider value={{ textSize, textScale, setTextSize }}>
            {children}
        </TextSizeContext.Provider>
    );
};
