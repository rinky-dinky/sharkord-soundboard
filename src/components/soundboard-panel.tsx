import type { TPluginSlotContext } from '@sharkord/plugin-sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TSoundEntry } from '../types';

const LOCAL_SOUNDS_CACHE_KEY = 'sharkord-soundboard-local-sounds';

type TExecuteCommand = (commandName: string, args?: Record<string, unknown>) => Promise<unknown>;

const debugLog = (event: string, details?: Record<string, unknown>) => {
  console.info('[soundboard][debug]', event, details || {});
};

const escapeArg = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const buildSlashCommand = (commandName: string, args?: Record<string, unknown>) => {
  if (!args || Object.keys(args).length === 0) {
    return `/${commandName}`;
  }

  const orderedArgValues = Object.values(args).map((value) => {
    if (value === null || value === undefined) return '""';
    return escapeArg(String(value));
  });

  return `/${commandName} ${orderedArgValues.join(' ')}`;
};

const getCommandExecutor = (ctx: TPluginSlotContext): TExecuteCommand => {
  const runtimeCtx = ctx as any;
  const sendMessage = runtimeCtx?.sendMessage as ((channelId: number, content: string) => void) | undefined;

  return async (commandName, args) => {
    const selectedChannelId = runtimeCtx?.selectedChannelId as number | undefined;

    if (!sendMessage || !selectedChannelId) {
      throw new Error('No text channel selected. Select a channel to send soundboard commands.');
    }

    const commandText = buildSlashCommand(commandName, args);
    debugLog('command.execute.sendMessage', {
      commandName,
      selectedChannelId,
      commandLength: commandText.length
    });

    await Promise.resolve(sendMessage(selectedChannelId, commandText));

    if (commandName === 'list_sounds') {
      return { sounds: [] };
    }

    return { queued: true };
  };
};


const SoundboardPanel = (ctx: TPluginSlotContext) => {
  const { currentVoiceChannelId } = ctx;
  const executeCommand = useMemo(() => getCommandExecutor(ctx), [ctx]);

  const [sounds, setSounds] = useState<TSoundEntry[]>([]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🦈');
  const [sourceUrl, setSourceUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_SOUNDS_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as TSoundEntry[];
      if (Array.isArray(parsed)) setSounds(parsed);
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCAL_SOUNDS_CACHE_KEY, JSON.stringify(sounds));
  }, [sounds]);

  useEffect(() => {
    console.info('[soundboard] panel mounted', { currentVoiceChannelId });
  }, [currentVoiceChannelId]);

  const runCommand = useCallback(
    async (commandName: string, args?: Record<string, unknown>) => {
      return executeCommand(commandName, args);
    },
    [executeCommand]
  );


  const onUpload = useCallback(async () => {
    if (!sourceUrl.trim()) {
      setError('Paste a file URL first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.info('[soundboard] uploading sound from URL', { name, emoji, sourceUrl });
      const soundId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      await runCommand('upload_sound', {
        name,
        emoji,
        url: sourceUrl.trim(),
        id: soundId
      });

      const optimisticSound: TSoundEntry = {
        id: soundId,
        name: name.trim(),
        emoji: emoji.trim(),
        mimeType: 'audio/mpeg',
        sourceUrl: sourceUrl.trim(),
        createdByUserId: 0,
        createdAt: Date.now()
      };
      setSounds((prev) => [optimisticSound, ...prev.filter((item) => item.id !== soundId)]);

      setSourceUrl('');
      setName('');
      setError('Uploaded via command. Sound added to local panel list.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [emoji, name, runCommand, sourceUrl]);

  const onPlay = useCallback(
    async (soundId: string) => {
      console.info('[soundboard] playing sound', { soundId, currentVoiceChannelId });
      setLoading(true);
      setError(null);
      try {
        await runCommand('play_sound', { soundId });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [currentVoiceChannelId, runCommand]
  );


  return (
    <div className="w-full h-full p-4 flex flex-col gap-3 overflow-auto">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {sounds.map((sound) => (
          <button
            key={sound.id}
            disabled={!currentVoiceChannelId || loading}
            onClick={() => onPlay(sound.id)}
            className="rounded border px-2 py-1 disabled:opacity-50"
          >
            {sound.emoji} {sound.name}
          </button>
        ))}
      </div>

      <details className="border rounded-md p-2" open={false}>
        <summary className="cursor-pointer select-none font-medium">Upload Sound</summary>
        <div className="mt-2 flex flex-col gap-2">
          <input
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            placeholder="Sound name"
            className="rounded border bg-transparent px-2 py-1"
          />
          <input
            value={emoji}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmoji(e.target.value)}
            placeholder="Emoji"
            maxLength={8}
            className="rounded border bg-transparent px-2 py-1"
          />
          <input
            value={sourceUrl}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSourceUrl(e.target.value)}
            placeholder="Direct file URL (https://...)"
            className="rounded border bg-transparent px-2 py-1"
          />
          <button
            type="button"
            disabled={!sourceUrl || !name || !emoji || loading}
            onClick={onUpload}
            className="rounded border px-2 py-1 disabled:opacity-50"
          >
            Upload to Shared Soundboard
          </button>
          <p className="text-xs opacity-70">
            Format: <code>/upload_sound "Sound Name" "🦈" "https://example.com/sound.mp3"</code>
          </p>
        </div>
      </details>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
};

export { SoundboardPanel };
