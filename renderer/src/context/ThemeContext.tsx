import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/context/SettingsContext';

type Theme = 'light' | 'dark';

type ThemeCtx = {
    theme: Theme;
    setTheme: (t: Theme) => void;
    toggleTheme: () => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

function applyThemeClass(theme: Theme) {
    const el = document.documentElement;
    if (theme === 'dark') el.classList.add('dark');
    else el.classList.remove('dark');
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { settings, setSettings } = useSettings();
    const [theme, setThemeState] = useState<Theme>('dark');

    // Initialize from settings when they arrive
    useEffect(() => {
        if (!settings?.theme) return;
        setThemeState(settings.theme);
        applyThemeClass(settings.theme);
    }, [settings?.theme]);

    const setTheme = (t: Theme) => {
        setThemeState(t);
        applyThemeClass(t);
        if (settings) void setSettings({ ...(settings as any), theme: t });
    };

    const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

    const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

// ✅ SAFE HOOK: returns a non-throwing fallback if provider isn't mounted yet
export function useTheme(): ThemeCtx {
    const ctx = useContext(Ctx);
    if (ctx) return ctx;

    // Fallback: keep UI usable, sync the <html> dark class, but don't persist
    let current: Theme = (document.documentElement.classList.contains('dark') ? 'dark' : 'light') as Theme;
    const setTheme = (t: Theme) => {
        current = t;
        applyThemeClass(t);
    };
    const toggleTheme = () => setTheme(current === 'dark' ? 'light' : 'dark');
    return { theme: current, setTheme, toggleTheme };
}
