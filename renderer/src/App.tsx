import React from 'react';
import { SettingsProvider } from '@/context/SettingsContext';
import { ImagesProvider, useImages } from '@/context/ImagesContext';
import { ThemeProvider } from '@/context/ThemeContext';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import ImageGrid from '@/components/ImageGrid';
import AboutModal from '@/components/Modals/AboutModal';
import SettingsModal from '@/components/Modals/SettingsModal';
import ImageModal from '@/components/Modals/ImageModal';

// ✅ use the large icon (ensure you have renderer/src/assets/icons/icon-256.png)
import aboutLogo from '@/assets/icons/icon-256.png';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: any }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error: any) { return { error }; }
    componentDidCatch(error: any, info: any) { console.error('Renderer ErrorBoundary', error, info); }
    render() {
        if (this.state.error) {
            return (
                <div className="p-6 h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
                    <h2 className="mb-3 text-lg font-semibold">Renderer crashed</h2>
                    <pre className="whitespace-pre-wrap text-sm">
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
                </div>
            );
        }
        return this.props.children as any;
    }
}

const ShellInner: React.FC = () => {
    const [aboutOpen, setAboutOpen] = React.useState(false);
    const [settingsOpen, setSettingsOpen] = React.useState(false);
    const [imageOpen, setImageOpen] = React.useState<string | null>(null);

    const { filtered, getNextPath, getPrevPath } = useImages();

    const currentItem = React.useMemo(
        () => (imageOpen ? filtered.find(i => i.path === imageOpen) || null : null),
        [imageOpen, filtered]
    );

    const handleNext = React.useCallback(() => {
        if (!imageOpen) return;
        const next = getNextPath(imageOpen);
        if (next) setImageOpen(next);
    }, [imageOpen, getNextPath]);

    const handlePrev = React.useCallback(() => {
        if (!imageOpen) return;
        const prev = getPrevPath(imageOpen);
        if (prev) setImageOpen(prev);
    }, [imageOpen, getPrevPath]);

    React.useEffect(() => {
        const nav = (e: Event) => {
            const to = (e as CustomEvent).detail?.to as string | undefined;
            if (to) setImageOpen(to);
        };
        window.addEventListener('imagenexus:navigate', nav as any);
        return () => window.removeEventListener('imagenexus:navigate', nav as any);
    }, []);

    return (
        <div className="h-screen w-screen grid grid-cols-[280px_1fr] grid-rows-[56px_1fr] bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
            <div className="col-span-2">
                <Header onOpenAbout={() => setAboutOpen(true)} onOpenSettings={() => setSettingsOpen(true)} />
            </div>

            <Sidebar />

            <main className="row-start-2 col-start-2 overflow-auto p-4">
                <ImageGrid onOpenImage={(p: string) => setImageOpen(p)} />
            </main>

            {/* ✅ pass big logo to AboutModal */}
            <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} logoSrc={aboutLogo} />

            <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
            <ImageModal
                open={!!imageOpen}
                item={currentItem}
                onClose={() => setImageOpen(null)}
                onNext={handleNext}
                onPrev={handlePrev}
            />
        </div>
    );
};

const App: React.FC = () => (
    <ErrorBoundary>
        <SettingsProvider>
            <ThemeProvider>
                <ImagesProvider>
                    <ShellInner />
                </ImagesProvider>
            </ThemeProvider>
        </SettingsProvider>
    </ErrorBoundary>
);

export default App;
