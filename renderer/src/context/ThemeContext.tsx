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
    const el = document.documentElement; // <html>
    if (theme === 'dark') el.classList.add('dark');
    else el.classList.remove('dark');
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { settings, setSettings } = useSettings();
    const [theme, setThemeState] = useState<Theme>('dark');

    // Initialize from settings or system preference
    useEffect(() => {
        const initial =
            (settings?.theme as Theme | undefined) ??
            (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        setThemeState(initial);
        applyThemeClass(initial);
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

export function useTheme(): ThemeCtx {
    const ctx = useContext(Ctx);
    if (ctx) return ctx;

    let current: Theme = (document.documentElement.classList.contains('dark') ? 'dark' : 'light') as Theme;
    const setTheme = (t: Theme) => {
        current = t;
        applyThemeClass(t);
    };
    const toggleTheme = () => setTheme(current === 'dark' ? 'light' : 'dark');
    return { theme: current, setTheme, toggleTheme };
}
