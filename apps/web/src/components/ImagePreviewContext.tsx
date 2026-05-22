import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type ImagePreviewState = { open: boolean; src: string };

type ImagePreviewContextValue = {
  openPreview: (src: string, title?: string) => void;
};

const ImagePreviewContext = createContext<ImagePreviewContextValue>({
  openPreview: () => {},
});

export function ImagePreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ImagePreviewState>({ open: false, src: '' });

  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  const openPreview = useCallback((src: string) => {
    setState({ open: true, src });
  }, []);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.open, close]);

  return (
    <ImagePreviewContext.Provider value={{ openPreview }}>
      {children}
      <Lightbox
        open={state.open}
        close={close}
        slides={[{ src: state.src }]}
        plugins={[Zoom]}
        carousel={{ finite: true }}
        render={{ buttonPrev: () => null, buttonNext: () => null }}
        styles={{
          root: {
            '--yarl__color_backdrop': 'rgba(0, 0, 0, 0.92)',
            zIndex: 99999,
          } as any,
          container: {
            width: '100vw',
            height: '100vh',
            maxWidth: '100vw',
            maxHeight: '100vh',
          },
        }}
      />
    </ImagePreviewContext.Provider>
  );
}

export function useImagePreview(): ImagePreviewContextValue {
  return useContext(ImagePreviewContext);
}
