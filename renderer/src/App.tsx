import React, { useMemo, useState } from 'react';
import { SettingsProvider } from './context/SettingsContext';
import { ImagesProvider } from './context/ImagesContext';
import { ThemeProvider } from './context/ThemeContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ImageGrid from './components/ImageGrid';
import ImageModal from './components/Modals/ImageModal';
import AboutModal from './components/Modals/AboutModal';
import SettingsModal from './components/Modals/SettingsModal';

const AppShell: React.FC = () => {
    const [aboutOpen, setAboutOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    return (
        <div className="h-screen w-screen grid grid-cols-[var(--sidebar-w)_1fr] grid-rows-[var(--header-h)_1fr]">
            <div className="col-span-2 row-span-1">
                <Header onOpenAbout={() => setAboutOpen(true)} onOpenSettings={() => setSettingsOpen(true)} />
            </div>
            <div className="col-span-1 row-start-2 border-r border-gray-800">
                <Sidebar />
            </div>
            <div className="col-start-2 row-start-2 overflow-hidden">
                <ImageGrid />
            </div>
            <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
            <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
            <ImageModal />
        </div>
    );
};

const App: React.FC = () => (
    <SettingsProvider>
        <ImagesProvider>
            <ThemeProvider>
                <AppShell />
            </ThemeProvider>
        </ImagesProvider>
    </SettingsProvider>
);

export default App;
