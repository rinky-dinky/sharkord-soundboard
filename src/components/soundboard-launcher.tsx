import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { SoundboardPanel } from './soundboard-panel';

const useSharkordStore = () => {
  const store = window.__SHARKORD_STORE__;
  const [state, setState] = useState(() => store.getState());
  useEffect(() => store.subscribe(() => setState(store.getState())), [store]);
  return { state, actions: store.actions };
};

const SoundboardLauncher = () => {
  const { actions } = useSharkordStore();
  const { executePluginAction } = actions;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingSound, setIsAddingSound] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setIsEditing(false);
    setIsAddingSound(false);
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
      const isEmojiDropdown = (target as Element).closest?.('[data-emoji-picker-dropdown]');
      if (!isLauncherClick && !isPanelClick && !isEmojiDropdown) handleClose();
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
        title="Open SoundDrop"
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
              aria-label="SoundDrop"
              style={panelStyle}
              className="h-[28rem] overflow-hidden flex flex-col rounded-lg border bg-background shadow-2xl"
            >
              <div className="flex items-center justify-between border-b px-3 py-2">
                <p className="text-sm font-medium">SoundDrop</p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => executePluginAction('stop_sounds').catch(() => {})}
                    title="Stop all sounds"
                    style={{
                      opacity: isPlaying ? 1 : 0,
                      pointerEvents: isPlaying ? 'auto' : 'none',
                      transition: 'opacity 300ms ease',
                      color: 'rgba(239,68,68,0.85)'
                    }}
                    className="rounded px-1.5 py-1 hover:bg-accent"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                      <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing((v) => !v)}
                    title={isEditing ? 'Done editing' : 'Edit sounds'}
                    aria-pressed={isEditing}
                    className={`rounded px-1.5 py-1 hover:bg-accent ${isEditing ? 'bg-accent text-foreground' : 'text-foreground/70'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingSound((v) => !v)}
                    title={isAddingSound ? 'Cancel adding sound' : 'Add sound'}
                    aria-pressed={isAddingSound}
                    className={`rounded px-1.5 py-1 hover:bg-accent ${isAddingSound ? 'bg-accent text-foreground' : 'text-foreground/70'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              <div>
                <SoundboardPanel
                  isEditing={isEditing}
                  isAddingSound={isAddingSound}
                  onAddSoundDone={() => setIsAddingSound(false)}
                  onPlayingChange={setIsPlaying}
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export { SoundboardLauncher };
