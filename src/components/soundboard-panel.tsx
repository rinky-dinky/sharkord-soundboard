import type { TPluginSlotContext } from '@sharkord/plugin-sdk';
import { createTRPCProxyClient, createWSClient, wsLink } from '@trpc/client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TSoundEntry } from '../types';

const getPluginId = () => 'sharkord-soundboard';

type TExecuteCommand = (commandName: string, args?: Record<string, unknown>) => Promise<unknown>;

const debugLog = (event: string, details?: Record<string, unknown>) => {
  console.info('[soundboard][debug]', event, details || {});
};

const unwrapCommandResponse = <T,>(response: unknown): T => {
  if (response && typeof response === 'object') {
    const envelope = response as Record<string, unknown>;

    if (envelope.error) {
      const errorMessage =
        typeof envelope.error === 'string'
          ? envelope.error
          : (envelope.error as any)?.message;
      throw new Error(errorMessage || 'Command failed.');
    }

    if ('result' in envelope) {
      return envelope.result as T;
    }

    if ('data' in envelope) {
      return envelope.data as T;
    }
  }

  return response as T;
};



const getCommandExecutor = (ctx: TPluginSlotContext): TExecuteCommand => {
  const runtimeCtx = ctx as any;
  const sharkordGlobal = (window as any)?.sharkord;

  const callCommand = (candidate: unknown): TExecuteCommand | null => {
    if (typeof candidate !== 'function') {
      return null;
    }

    return async (commandName, args) => {
      const pluginId = getPluginId();
      const attemptCalls: Array<{ label: string; call: () => unknown }> = [
        {
          label: 'object:{pluginId,commandName,args}',
          call: () => candidate({ pluginId, commandName, args })
        },
        {
          label: 'args:(pluginId,commandName,args)',
          call: () => candidate(pluginId, commandName, args)
        },
        {
          label: 'args:(pluginId:commandName,args)',
          call: () => candidate(`${pluginId}:${commandName}`, args)
        },
        {
          label: 'args:(commandName,args)',
          call: () => candidate(commandName, args)
        }
      ];

      let lastError: unknown = null;
      for (const attempt of attemptCalls) {
        try {
          const response = await Promise.resolve(attempt.call());
          debugLog('command.execute.bridge.call-success', { commandName, signature: attempt.label });
          return unwrapCommandResponse(response);
        } catch (error) {
          lastError = error;
          debugLog('command.execute.bridge.call-failure', {
            commandName,
            signature: attempt.label,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      throw lastError instanceof Error ? lastError : new Error('Unable to invoke soundboard command.');
    };
  };

  const candidates = [
    { name: 'ctx.executeCommand', fn: runtimeCtx?.executeCommand },
    { name: 'ctx.executePluginCommand', fn: runtimeCtx?.executePluginCommand },
    { name: 'ctx.invokePluginCommand', fn: runtimeCtx?.invokePluginCommand },
    { name: 'ctx.commands.execute', fn: runtimeCtx?.commands?.execute },
    { name: 'ctx.commands.executeCommand', fn: runtimeCtx?.commands?.executeCommand },
    { name: 'ctx.plugins.executeCommand', fn: runtimeCtx?.plugins?.executeCommand },
    { name: 'ctx.plugins.execute', fn: runtimeCtx?.plugins?.execute },
    { name: 'window.sharkord.executeCommand', fn: sharkordGlobal?.executeCommand },
    { name: 'window.sharkord.executePluginCommand', fn: sharkordGlobal?.executePluginCommand },
    { name: 'window.sharkord.commands.execute', fn: sharkordGlobal?.commands?.execute },
    { name: 'window.sharkord.commands.executeCommand', fn: sharkordGlobal?.commands?.executeCommand },
    { name: 'window.sharkord.plugins.executeCommand', fn: sharkordGlobal?.plugins?.executeCommand },
    { name: 'window.sharkord.plugins.execute', fn: sharkordGlobal?.plugins?.execute }
  ];


  return async (commandName, args) => {
    debugLog('command.execute.start', {
      commandName,
      candidateCount: candidates.length,
      availableCandidates: candidates.filter((c) => typeof c.fn === 'function').map((c) => c.name),
      ctxKeys: Object.keys(runtimeCtx || {}),
      sharkordKeys: Object.keys(sharkordGlobal || {})
    });

    let lastError: unknown = null;

    for (const candidate of candidates) {
      const executor = callCommand(candidate.fn);
      if (!executor) continue;

      try {
        const result = await executor(commandName, args);
        debugLog('command.execute.bridge.success', { commandName, candidate: candidate.name });
        return result;
      } catch (error) {
        lastError = error;
        debugLog('command.execute.bridge.failure', {
          commandName,
          candidate: candidate.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    const bridgeError = lastError instanceof Error ? lastError.message : String(lastError || 'none');

    throw new Error(
      `Soundboard command bridge is unavailable. No compatible execute API was found on slot context/window. Last bridge error: ${bridgeError}. This Sharkord SDK context appears to expose UI-only APIs (like sendMessage) but not direct plugin command invocation.`
    );
  };
};

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Invalid file read.'));
        return;
      }

      const comma = result.indexOf(',');
      resolve(comma > -1 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });

const SoundboardPanel = (ctx: TPluginSlotContext) => {
  const { currentVoiceChannelId } = ctx;
  const executeCommand = useMemo(() => getCommandExecutor(ctx), [ctx]);

  const [sounds, setSounds] = useState<TSoundEntry[]>([]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🦈');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.info('[soundboard] panel mounted', { currentVoiceChannelId });
  }, [currentVoiceChannelId]);

  const runCommand = useCallback(
    async (commandName: string, args?: Record<string, unknown>) => {
      return executeCommand(commandName, args);
    },
    [executeCommand]
  );

  const refresh = useCallback(async () => {
    console.info('[soundboard] refreshing sounds list');
    const response = unwrapCommandResponse<{ sounds?: TSoundEntry[] }>(
      await runCommand('list_sounds')
    );
    setSounds(Array.isArray(response?.sounds) ? response.sounds : []);
  }, [runCommand]);

  useEffect(() => {
    refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [refresh]);

  const onUpload = useCallback(async () => {
    if (!file) {
      setError('Choose a file first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.info('[soundboard] uploading sound', { name, emoji, mimeType: file.type });
      const dataBase64 = await fileToBase64(file);

      await runCommand('upload_sound', {
        name,
        emoji,
        mimeType: file.type || 'audio/mpeg',
        dataBase64
      });

      setFile(null);
      setName('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [emoji, file, name, refresh, runCommand]);

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
      <h2 className="text-xl font-semibold">Sharkord Soundboard</h2>

      <p className="text-sm opacity-70">
        {currentVoiceChannelId
          ? 'Click a sound to play it in your active voice call.'
          : 'Join a voice channel to play sounds.'}
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

      <div className="flex gap-2">
        <button type="button" className="rounded border px-2 py-1" onClick={() => refresh()}>
          Refresh
        </button>
      </div>

      <div className="border rounded-md p-3 flex flex-col gap-2">
        <h3 className="font-medium">Upload Sound</h3>
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
          type="file"
          accept="audio/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <button
          type="button"
          disabled={!file || !name || !emoji || loading}
          onClick={onUpload}
          className="rounded border px-2 py-1 disabled:opacity-50"
        >
          Upload to Shared Soundboard
        </button>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
};

export { SoundboardPanel };
