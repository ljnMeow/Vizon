import {
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const PhotoSlider = lazy(async () => {
  await import('react-photo-view/dist/react-photo-view.css');
  const mod = await import('react-photo-view');
  return { default: mod.PhotoSlider };
});

type ImagePreviewState = { open: boolean; src: string; title?: string };

type ImagePreviewContextValue = {
  openPreview: (src: string, title?: string) => void;
};

const ImagePreviewContext = createContext<ImagePreviewContextValue>({
  openPreview: () => {},
});

export function ImagePreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ImagePreviewState>({ open: false, src: '' });

  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  const openPreview = useCallback((src: string, title?: string) => {
    const normalized = src?.trim();
    if (!normalized) return;
    setState({ open: true, src: normalized, title });
  }, []);

  const images = useMemo(
    () => [{ src: state.src, key: state.src }],
    [state.src],
  );

  const showPreview = state.open && Boolean(state.src);

  return (
    <ImagePreviewContext.Provider value={{ openPreview }}>
      {children}
      {showPreview ? (
        <>
          <Suspense fallback={null}>
            <PhotoSlider
              images={images}
              visible
              onClose={close}
              index={0}
              onIndexChange={() => {}}
              maskOpacity={0.92}
              maskClosable
              pullClosable
              bannerVisible={false}
              className="vizon-image-preview"
              maskClassName="vizon-image-preview-mask"
            />
          </Suspense>
          {state.title ? (
            <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100000] px-4 text-center text-sm text-white/90">
              {state.title}
            </div>
          ) : null}
        </>
      ) : null}
    </ImagePreviewContext.Provider>
  );
}

export function useImagePreview(): ImagePreviewContextValue {
  return useContext(ImagePreviewContext);
}
