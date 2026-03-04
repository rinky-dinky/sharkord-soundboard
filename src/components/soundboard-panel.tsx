import type { TPluginSlotContext } from '@sharkord/plugin-sdk';
import { createTRPCProxyClient, createWSClient, wsLink } from '@trpc/client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TSoundEntry } from '../types';

const getPluginId = () => 'sharkord-soundboard';

type TExecuteCommand = (commandName: string, args?: Record<string, unknown>) => Promise<unknown>;

type TPluginCommandRouter = {
  plugins: {
    executeCommand: {
      mutate: (input: {
        pluginId: string;
        commandName: string;
        args?: Record<string, unknown>;
      }) => Promise<unknown>;
    };
  };
};

let trpcExecutor: TExecuteCommand | null = null;

const createTrpcExecutor = (): TExecuteCommand => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const token = sessionStorage.getItem('sharkord-token') || '';
  const wsClient = createWSClient({
    url: `${protocol}://${window.location.host}`,
    connectionParams: async () => ({ token })
  });
  const trpc = createTRPCProxyClient<any>({
    links: [wsLink({ client: wsClient })]
  });

  return (commandName, args) =>
    (trpc as unknown as TPluginCommandRouter).plugins.executeCommand.mutate({
      pluginId: getPluginId(),
      commandName,
      args
    });
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

const getCommandExecutor = (ctx: TPluginSlotContext): TExecuteCommand | null => {
  const runtimeCtx = ctx as any;
  const sharkordGlobal = (window as any)?.sharkord;

  const callCommand = (candidate: unknown): TExecuteCommand | null => {
    if (typeof candidate !== 'function') {
      return null;
    }

    return async (commandName, args) => {
      const pluginId = getPluginId();
      const attemptCalls: Array<() => unknown> = [
        () => candidate({ pluginId, commandName, args }),
        () => candidate(pluginId, commandName, args),
        () => candidate(`${pluginId}:${commandName}`, args),
        () => candidate(commandName, args)
      ];

      let lastError: unknown = null;
      for (const attempt of attemptCalls) {
        try {
          const response = await Promise.resolve(attempt());
          return unwrapCommandResponse(response);
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError instanceof Error ? lastError : new Error('Unable to invoke soundboard command.');
    };
  };

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

  for (const candidate of candidates) {
    const executor = callCommand(candidate);
    if (executor) {
      return executor;
    }
  }

  if (!trpcExecutor) {
    trpcExecutor = createTrpcExecutor();
  }

  return trpcExecutor;
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
      if (!executeCommand) {
        throw new Error('Soundboard command bridge is unavailable in this Sharkord build.');
      }

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
