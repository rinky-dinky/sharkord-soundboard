import type { TPluginSlotContext } from '@sharkord/plugin-sdk';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SoundboardPanel } from './soundboard-panel';

const SoundboardLauncher = (ctx: TPluginSlotContext) => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Open Soundboard"
        className="h-8 rounded px-2 text-sm hover:bg-accent"
      >
        🔊
      </button>

      {mounted
        ? createPortal(
            <div
              className={`fixed bottom-20 left-4 z-[2147483647] h-[28rem] w-[24rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-background shadow-2xl ${
                open ? '' : 'hidden'
              }`}
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
    </>
  );
};

export { SoundboardLauncher };
