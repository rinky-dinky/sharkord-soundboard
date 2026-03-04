import type { TPluginSlotContext } from '@sharkord/plugin-sdk';
import { useEffect, useRef, useState } from 'react';
import { SoundboardPanel } from './soundboard-panel';

const SoundboardLauncher = (ctx: TPluginSlotContext) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

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

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

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

      {open ? (
        <div
          role="dialog"
          aria-label="Soundboard"
          className="absolute right-0 top-full z-[2147483647] mt-2 h-[28rem] w-[24rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-background shadow-2xl"
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
        </div>
      ) : null}
    </div>
  );
};

export { SoundboardLauncher };
