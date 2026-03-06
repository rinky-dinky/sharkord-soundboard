import type { TPluginSlotContext } from '@sharkord/plugin-sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TSoundEntry } from '../types';

const LOCAL_SOUNDS_CACHE_KEY = 'sharkord-soundboard-local-sounds';
const LOCAL_MIRROR_URL_KEY = 'sharkord-soundboard-mirror-url';
const DEFAULT_MIRROR_URL = '/public/soundboard-sounds.json';

const EMOJI_OPTIONS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
  '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
  '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪',
  '😝', '🤑', '🤗', '🤭', '🫢', '🫣', '🤫', '🤔',
  '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏',
  '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤',
  '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵',
  '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓',
  '🦈', '🔊', '🎵', '🎶', '🎧', '🎤', '📣', '🎚️'
];

type TExecuteCommand = (commandName: string, args?: Record<string, unknown>) => Promise<unknown>;

const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(decodeURIComponent(value));
    } catch {
      return value;
    }
  }
};

const extractSounds = (value: unknown): TSoundEntry[] | null => {
  const parsed = parseMaybeJson(value);

  if (Array.isArray(parsed)) {
    return parsed as TSoundEntry[];
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const record = parsed as Record<string, unknown>;

  if (Array.isArray(record.sounds)) {
    return record.sounds as TSoundEntry[];
  }

  for (const child of Object.values(record)) {
    const found = extractSounds(child);
    if (found) return found;
  }

  return null;
};

const resolveMirrorUrl = (rawUrl: string) => {
  const trimmed = rawUrl.trim();
  if (!trimmed) return DEFAULT_MIRROR_URL;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  return `/${trimmed}`;
};

const loadSoundsFromMirror = async (mirrorUrl: string): Promise<TSoundEntry[]> => {
  const resolvedUrl = resolveMirrorUrl(mirrorUrl);
  const cacheBust = resolvedUrl.includes('?') ? '&' : '?';
  const response = await fetch(`${resolvedUrl}${cacheBust}t=${Date.now()}`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Mirror URL returned ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const sounds = extractSounds(payload);

  if (!Array.isArray(sounds)) {
    throw new Error('Mirror URL returned an invalid sounds payload.');
  }

  return sounds;
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
    await Promise.resolve(sendMessage(selectedChannelId, commandText));

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [mirrorUrlInput, setMirrorUrlInput] = useState(DEFAULT_MIRROR_URL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const rawSounds = localStorage.getItem(LOCAL_SOUNDS_CACHE_KEY);
      if (rawSounds) {
        const parsed = JSON.parse(rawSounds) as TSoundEntry[];
        if (Array.isArray(parsed)) setSounds(parsed);
      }

      const rawMirrorUrl = localStorage.getItem(LOCAL_MIRROR_URL_KEY);
      if (rawMirrorUrl) setMirrorUrlInput(rawMirrorUrl);
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCAL_SOUNDS_CACHE_KEY, JSON.stringify(sounds));
  }, [sounds]);

  const syncFromMirror = useCallback(async (requestedUrl?: string) => {
    const selectedMirrorUrl = resolveMirrorUrl(requestedUrl ?? mirrorUrlInput);
    setLoading(true);
    setError(null);

    try {
      const nextSounds = await loadSoundsFromMirror(selectedMirrorUrl);
      setSounds(nextSounds);
      localStorage.setItem(LOCAL_MIRROR_URL_KEY, selectedMirrorUrl);
      setMirrorUrlInput(selectedMirrorUrl);
    } catch (e) {
      setError(`Could not load shared sounds from mirror URL: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [mirrorUrlInput]);

  useEffect(() => {
    syncFromMirror().catch(() => {});
  }, [syncFromMirror]);

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
      setShowEmojiPicker(false);
      setError('Sound added. Re-sync from mirror after server writes the updated JSON.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [emoji, name, runCommand, sourceUrl]);

  const onPlay = useCallback(
    async (soundId: string) => {
      setLoading(true);
      setError(null);
      try {
        await runCommand('play_sound', { soundId });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);

        if (/sound not found/i.test(message)) {
          setSounds((prev) => prev.filter((entry) => entry.id !== soundId));
          setError('That sound no longer exists and was removed from your local list.');
        } else {
          setError(message);
        }
      } finally {
        setLoading(false);
      }
    },
    [runCommand]
  );

  return (
    <div className="w-full h-full p-4 flex flex-col gap-3 overflow-auto">
      <p className="text-sm opacity-70">
        {currentVoiceChannelId ? 'Click a sound to play it in your active voice call.' : 'Join a voice call to play sounds.'}
      </p>

      <div className="rounded border p-2 flex flex-col gap-2">
        <p className="text-xs opacity-70">Shared sounds mirror URL</p>
        <div className="flex gap-2 items-center">
          <input
            value={mirrorUrlInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMirrorUrlInput(e.target.value)}
            placeholder="/public/your-uploaded-sounds.json"
            className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1"
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => syncFromMirror()}
            className="rounded border px-2 py-1 disabled:opacity-50"
          >
            Sync
          </button>
        </div>
      </div>

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
        <summary className="cursor-pointer select-none font-medium">Add Sound</summary>
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex gap-2 items-center">
            <input
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="Sound name"
              className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1"
            />
            <button
              type="button"
              className="inline-flex h-9 min-h-9 w-9 min-w-9 shrink-0 items-center justify-center rounded border p-0 text-xl leading-none hover:bg-accent"
              onClick={() => setShowEmojiPicker((v) => !v)}
              title="Pick emoji"
              aria-label="Pick emoji"
              aria-expanded={showEmojiPicker}
            >
              {emoji || '😀'}
            </button>
          </div>
          {showEmojiPicker ? (
            <div className="grid grid-cols-8 gap-1 rounded border p-2">
              {EMOJI_OPTIONS.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  className={`rounded px-1 py-1 text-lg hover:bg-accent ${emoji === candidate ? 'bg-accent' : ''}`}
                  onClick={() => {
                    setEmoji(candidate);
                    setShowEmojiPicker(false);
                  }}
                >
                  {candidate}
                </button>
              ))}
            </div>
          ) : null}
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
            Add
          </button>
        </div>
      </details>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
};

export { SoundboardPanel };
