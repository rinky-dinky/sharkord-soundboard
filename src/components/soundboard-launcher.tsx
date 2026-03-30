import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { SoundboardPanel } from './soundboard-panel';

const SoundboardLauncher = () => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setIsEditing(false);
  }, []);

  const updatePanelPosition = useCallback(() => {
    const buttonRect = containerRef.current?.getBoundingClientRect();
    if (!buttonRect) return;

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
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePanelPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const isLauncherClick = containerRef.current?.contains(target);
      const isPanelClick = panelRef.current?.contains(target);
      if (!isLauncherClick && !isPanelClick) handleClose();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
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
  }, [open, handleClose, updatePanelPosition]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Open Soundboard"
        className="flex h-8 w-8 items-center justify-center rounded p-0 text-sm leading-none text-foreground/70 hover:bg-accent hover:text-foreground"
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
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsEditing((v) => !v)}
                    title={isEditing ? 'Done editing' : 'Edit sounds'}
                    aria-pressed={isEditing}
                    className={`rounded px-1.5 py-1 hover:bg-accent ${isEditing ? 'bg-accent text-foreground' : 'text-foreground/70'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    title="Close Soundboard"
                    className="rounded px-2 py-1 hover:bg-accent"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="h-[calc(100%-45px)]">
                <SoundboardPanel isEditing={isEditing} />
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export { SoundboardLauncher };
