import type { TPluginSlotContext } from '@sharkord/plugin-sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { SoundboardPanel } from './soundboard-panel';

const SoundboardLauncher = (ctx: TPluginSlotContext) => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePanelPosition = useMemo(
    () => () => {
      const buttonRect = containerRef.current?.getBoundingClientRect();
      if (!buttonRect) {
        return;
      }

      const panelWidth = Math.min(384, window.innerWidth - 16);
      const left = Math.min(
        Math.max(8, buttonRect.right - panelWidth),
        window.innerWidth - panelWidth - 8
      );

      const top = Math.min(buttonRect.bottom + 8, window.innerHeight - 8);

      setPanelStyle({
        position: 'fixed',
        top,
        left,
        width: panelWidth,
        maxWidth: 'calc(100vw - 1rem)',
        zIndex: 2147483647
      });
    },
    []
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    updatePanelPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const isLauncherClick = containerRef.current?.contains(target);
      const isPanelClick = panelRef.current?.contains(target);

      if (!isLauncherClick && !isPanelClick) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    const handleViewportChange = () => updatePanelPosition();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, updatePanelPosition]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Open Soundboard"
        className="flex h-8 w-8 items-center justify-center rounded p-0 text-sm leading-none hover:bg-accent"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="block">
          <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2" />
          <rect x="7" y="11" width="2" height="2" rx="1" fill="currentColor" />
          <rect x="10" y="9" width="2" height="6" rx="1" fill="currentColor" />
          <rect x="13" y="7" width="2" height="10" rx="1" fill="currentColor" />
          <rect x="16" y="9" width="2" height="6" rx="1" fill="currentColor" />
        </svg>
      </button>

      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Soundboard"
              style={panelStyle}
              className="h-[28rem] rounded-lg border bg-background shadow-2xl"
            >
              <div className="flex items-center justify-between border-b px-3 py-2">
                <p className="text-sm font-medium">Soundboard</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  title="Close Soundboard"
                  className="rounded px-2 py-1 hover:bg-accent"
                >
                  ✕
                </button>
              </div>

              <div className="h-[calc(100%-45px)]">
                <SoundboardPanel {...ctx} />
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export { SoundboardLauncher };
