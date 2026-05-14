import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ImagePreviewState = { open: boolean; src: string };

type ImagePreviewContextValue = {
  openPreview: (src: string, title?: string) => void;
};

const ImagePreviewContext = createContext<ImagePreviewContextValue>({
  openPreview: () => {},
});

export function ImagePreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ImagePreviewState>({ open: false, src: '' });

  const openPreview = useCallback((src: string) => {
    setState({ open: true, src });
  }, []);

  return (
    <ImagePreviewContext.Provider value={{ openPreview }}>
      {children}
      <Lightbox
        open={state.open}
        close={() => setState((s) => ({ ...s, open: false }))}
        slides={[{ src: state.src }]}
        plugins={[Zoom]}
        carousel={{ finite: true }}
        render={{ buttonPrev: () => null, buttonNext: () => null }}
        styles={{
          root: { '--yarl__color_backdrop': 'rgba(0, 0, 0, 0.65)' } as any,
          container: {
            width: 'min(760px, 90vw)',
            height: 'min(560px, 85vh)',
            margin: 'auto',
            borderRadius: '12px',
            overflow: 'hidden',
          },
        }}
      />
    </ImagePreviewContext.Provider>
  );
}

export function useImagePreview(): ImagePreviewContextValue {
  return useContext(ImagePreviewContext);
}
