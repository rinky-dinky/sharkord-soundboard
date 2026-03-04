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
      if (!containerRef.current?.contains(event.target as Node)) {
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
        className="h-8 rounded px-2 text-sm hover:bg-accent"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        🔊
      </button>

      {mounted && open
        ? createPortal(
            <div
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
