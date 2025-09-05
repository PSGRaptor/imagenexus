import React, { createContext, useContext } from 'react';
import { useSettings } from './SettingsContext';

type Ctx = { toggleTheme: () => void; };

const ThemeContext = createContext<Ctx | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { settings, setSettings } = useSettings();

    const toggleTheme = () => {
        if (!settings) return;
        const next = settings.theme === 'dark' ? 'light' : 'dark';
        setSettings({ ...settings, theme: next });
    };

    return (
        <ThemeContext.Provider value={{ toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
}
