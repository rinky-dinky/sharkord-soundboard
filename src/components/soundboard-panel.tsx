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
  const sharkordGlobal = (window as any)?.sharkord;
  const sendMessage = runtimeCtx?.sendMessage as ((channelId: number, content: string) => void) | undefined;

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


  const availableCandidates = candidates.filter((c) => typeof c.fn === 'function');

  return async (commandName, args) => {
    debugLog('command.execute.start', {
      commandName,
      candidateCount: candidates.length,
      availableCandidates: availableCandidates.map((c) => c.name),
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

    const selectedChannelId = runtimeCtx?.selectedChannelId as number | undefined;

    if (!sendMessage || !selectedChannelId) {
      throw new Error(
        `No command bridge found. Also cannot fallback to sendMessage because no text channel is selected. Last bridge error: ${bridgeError}`
      );
    }

    const commandText = buildSlashCommand(commandName, args);
    debugLog('command.execute.sendMessage.fallback', {
      commandName,
      selectedChannelId,
      commandLength: commandText.length,
      bridgeError
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
  const bridgeAvailable = useMemo(() => {
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

    return candidates.some((candidate) => typeof candidate === 'function');
  }, [ctx]);

  const [sounds, setSounds] = useState<TSoundEntry[]>([]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🦈');
  const [sourceUrl, setSourceUrl] = useState('');
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

    if (!bridgeAvailable) {
      setError('Refresh requires command bridge support in this Sharkord build.');
      return;
    }

    const response = unwrapCommandResponse<{ sounds?: TSoundEntry[] }>(
      await runCommand('list_sounds')
    );

    setSounds(Array.isArray(response?.sounds) ? response.sounds : []);
  }, [bridgeAvailable, runCommand]);

  useEffect(() => {
    if (!bridgeAvailable) return;

    refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [bridgeAvailable, refresh]);

  const onUpload = useCallback(async () => {
    if (!sourceUrl.trim()) {
      setError('Paste a file URL first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.info('[soundboard] uploading sound from URL', { name, emoji, sourceUrl });

      await runCommand('upload_sound', {
        name,
        emoji,
        url: sourceUrl.trim()
      });

      setSourceUrl('');
      setName('');
      if (bridgeAvailable) {
        await refresh();
      } else {
        setError('Sent /upload_sound command to the selected channel. If bridge is unavailable, use Refresh after command completes.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bridgeAvailable, emoji, name, refresh, runCommand, sourceUrl]);

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
        <button
          type="button"
          className="rounded border px-2 py-1 disabled:opacity-50"
          disabled={loading || !bridgeAvailable}
          onClick={() => refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)))}
        >
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
      </div>

      <p className="text-xs opacity-70">
        Command format: <code>/upload_sound "Sound Name" "🦈" "https://example.com/sound.mp3"</code>
      </p>


      {!bridgeAvailable ? (
        <p className="text-sm text-yellow-500">
          Bridge is unavailable in this Sharkord build. Refresh will not return direct data, but Upload/Play can be sent as chat commands.
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
};

export { SoundboardPanel };
