import type { TPluginSlotContext } from '@sharkord/plugin-sdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TSoundEntry } from '../types';

const LOCAL_SOUNDS_CACHE_KEY = 'sharkord-soundboard-local-sounds';
const LIST_SOUNDS_DEBUG_DONE_FLAG = '__sharkordSoundboardListSoundsDebugDone';

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
type TDirectCommandCandidate = (...args: unknown[]) => unknown;
type TSettingsGetterCandidate = (key: string) => unknown;

const debugLog = (event: string, details?: Record<string, unknown>) => {
  console.info('[soundboard][debug]', event, details || {});
};

const tryParseJsonString = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const extractSounds = (value: unknown): TSoundEntry[] | null => {
  const parsed = tryParseJsonString(value);

  if (Array.isArray(parsed)) return parsed as TSoundEntry[];
  if (!parsed || typeof parsed !== 'object') return null;

  const record = parsed as Record<string, unknown>;
  if (Array.isArray(record.sounds)) return record.sounds as TSoundEntry[];

  for (const child of Object.values(record)) {
    const found = extractSounds(child);
    if (found) return found;
  }

  return null;
};

const summarizeResponseForDebug = (value: unknown) => {
  const parsed = tryParseJsonString(value);
  if (Array.isArray(parsed)) return { type: 'array', length: parsed.length };
  if (!parsed || typeof parsed !== 'object') return { type: typeof parsed };
  const record = parsed as Record<string, unknown>;
  return {
    type: 'object',
    keys: Object.keys(record),
    soundsIsArray: Array.isArray(record.sounds),
    soundsLength: Array.isArray(record.sounds) ? record.sounds.length : undefined
  };
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

    return { queued: true };
  };
};

const resolveDirectCommandCandidates = (ctx: TPluginSlotContext): TDirectCommandCandidate[] => {
  const runtimeCtx = ctx as any;
  const sharkordGlobal = (window as any)?.sharkord;

  const candidates = [
    runtimeCtx?.executeCommand,
    runtimeCtx?.executePluginCommand,
    runtimeCtx?.invokePluginCommand,
    runtimeCtx?.commands?.execute,
    runtimeCtx?.commands?.executeCommand,
    runtimeCtx?.plugins?.executeCommand,
    runtimeCtx?.plugins?.execute,
    sharkordGlobal?.executeCommand,
    sharkordGlobal?.executePluginCommand,
    sharkordGlobal?.commands?.execute,
    sharkordGlobal?.commands?.executeCommand,
    sharkordGlobal?.plugins?.executeCommand,
    sharkordGlobal?.plugins?.execute
  ];

  return Array.from(new Set(candidates.filter((candidate) => typeof candidate === 'function')));
};

const resolveSettingsGetters = (ctx: TPluginSlotContext): TSettingsGetterCandidate[] => {
  const runtimeCtx = ctx as any;
  const sharkordGlobal = (window as any)?.sharkord;

  const candidates = [
    runtimeCtx?.settings?.get,
    runtimeCtx?.settings?.getSetting,
    runtimeCtx?.plugins?.settings?.get,
    runtimeCtx?.plugins?.getSetting,
    runtimeCtx?.getSetting,
    runtimeCtx?.getPluginSetting,
    sharkordGlobal?.settings?.get,
    sharkordGlobal?.settings?.getSetting,
    sharkordGlobal?.plugins?.settings?.get,
    sharkordGlobal?.plugins?.getSetting,
    sharkordGlobal?.getSetting,
    sharkordGlobal?.getPluginSetting
  ];

  return Array.from(new Set(candidates.filter((candidate) => typeof candidate === 'function')));
};

const callDirectCandidate = async (candidate: TDirectCommandCandidate, commandName: string): Promise<unknown> => {
  const attempts: unknown[][] = [
    [commandName],
    [{ commandName, args: {} }],
    [{ name: commandName, args: {} }]
  ];

  for (const args of attempts) {
    try {
      return await Promise.resolve(candidate(...args));
    } catch {
      // continue trying signatures
    }
  }

  return undefined;
};

const SoundboardPanel = (ctx: TPluginSlotContext) => {
  const { currentVoiceChannelId } = ctx;
  const executeCommand = useMemo(() => getCommandExecutor(ctx), [ctx]);
  const directCandidates = useMemo(() => resolveDirectCommandCandidates(ctx), [ctx]);
  const settingsGetters = useMemo(() => resolveSettingsGetters(ctx), [ctx]);
  const [sounds, setSounds] = useState<TSoundEntry[]>([]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🦈');
  const [sourceUrl, setSourceUrl] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const directCandidatesRef = useRef(directCandidates);
  const settingsGettersRef = useRef(settingsGetters);
  const executeCommandRef = useRef(executeCommand);

  useEffect(() => {
    directCandidatesRef.current = directCandidates;
  }, [directCandidates]);

  useEffect(() => {
    settingsGettersRef.current = settingsGetters;
  }, [settingsGetters]);

  useEffect(() => {
    executeCommandRef.current = executeCommand;
  }, [executeCommand]);

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
    let mounted = true;

    const loadAuthoritativeSounds = async () => {
      const hasLogged = Boolean((window as any)[LIST_SOUNDS_DEBUG_DONE_FLAG]);
      const directCandidatesSnapshot = directCandidatesRef.current.slice(0, 4);
      const settingsGettersSnapshot = settingsGettersRef.current.slice(0, 4);

      for (let index = 0; index < directCandidatesSnapshot.length; index += 1) {
        const raw = await callDirectCandidate(directCandidatesSnapshot[index]!, 'list_sounds');
        const extracted = extractSounds(raw);

        if (!hasLogged) {
          console.info('[soundboard][debug] list_sounds direct candidate response', {
            index,
            summary: summarizeResponseForDebug(raw),
            raw
          });
        }

        if (Array.isArray(extracted) && mounted) {
          setSounds(extracted);
          if (!hasLogged) (window as any)[LIST_SOUNDS_DEBUG_DONE_FLAG] = true;
          return;
        }
      }

      for (let index = 0; index < settingsGettersSnapshot.length; index += 1) {
        try {
          const raw = await Promise.resolve(settingsGettersSnapshot[index]!('soundsJson'));
          const extracted = extractSounds(raw);

          if (!hasLogged) {
            console.info('[soundboard][debug] soundsJson getter response', {
              index,
              summary: summarizeResponseForDebug(raw),
              raw
            });
          }

          if (Array.isArray(extracted) && mounted) {
            setSounds(extracted);
            if (!hasLogged) (window as any)[LIST_SOUNDS_DEBUG_DONE_FLAG] = true;
            return;
          }
        } catch {
          // continue
        }
      }

      const fallback = await executeCommandRef.current('list_sounds');
      const extracted = extractSounds(fallback);

      if (!hasLogged) {
        console.info('[soundboard][debug] list_sounds sendMessage fallback response', {
          summary: summarizeResponseForDebug(fallback),
          raw: fallback
        });
        (window as any)[LIST_SOUNDS_DEBUG_DONE_FLAG] = true;
      }

      if (Array.isArray(extracted) && mounted) {
        setSounds(extracted);
      }
    };

    loadAuthoritativeSounds().catch((e) => {
      console.info('[soundboard] could not load authoritative sounds', e);
    });

    return () => {
      mounted = false;
    };
  }, []);

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
      setError('Sound added.');
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
