import React, { createContext, useContext, useEffect, useState } from 'react';
import type { UserSettings } from '../types';

type Ctx = {
    settings: UserSettings | null;
    setSettings: (s: UserSettings) => void;
    reload: () => Promise<void>;
};

const SettingsContext = createContext<Ctx | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettingsState] = useState<UserSettings | null>(null);

    const reload = async () => {
        const s = await window.api.getSettings();
        setSettingsState(s);
        document.documentElement.classList.toggle('dark', s.theme === 'dark');
    };

    const setSettings = async (s: UserSettings) => {
        await window.api.setSettings(s);
        await reload();
    };

    useEffect(() => { reload(); }, []);

    return (
        <SettingsContext.Provider value={{ settings, setSettings, reload }}>
            {children}
        </SettingsContext.Provider>
    );
};

export function useSettings() {
    const ctx = useContext(SettingsContext);
    if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
    return ctx;
}
