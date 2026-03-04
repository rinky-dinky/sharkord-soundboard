import type { TPluginSlotContext } from '@sharkord/plugin-sdk';
import { Button } from '@sharkord/ui';
import { useState } from 'react';
import { SoundboardPanel } from './soundboard-panel';

const SoundboardLauncher = (ctx: TPluginSlotContext) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen((v) => !v)} title="Open Soundboard">
        🔊
      </Button>

      {open ? (
        <div className="fixed bottom-20 left-4 z-[9999] w-[24rem] max-w-[calc(100vw-2rem)] h-[28rem] rounded-lg border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-medium">Soundboard</p>
            <Button variant="ghost" onClick={() => setOpen(false)} title="Close Soundboard">
              ✕
            </Button>
          </div>

          <div className="h-[calc(100%-45px)]">
            <SoundboardPanel {...ctx} />
          </div>
        </div>
      ) : null}
    </>
  );
};

export { SoundboardLauncher };
