import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { PlainTransport, PluginContext, Producer, TInvokerContext } from '@sharkord/plugin-sdk';
import { type TListSoundsResponse, type TSoundEntry } from './types';

const SOUNDS_SETTINGS_KEY = 'soundsJson';
const PUBLIC_MIRROR_FILENAME_SETTINGS_KEY = 'publicMirrorFileName';
const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 2;
const RTP_AUDIO_PAYLOAD_TYPE = 111;

const getFfmpegBinaryPath = (pluginPath: string) => {
  const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  return join(pluginPath, 'bin', binaryName);
};

const assertFfmpegBinary = async (pluginPath: string) => {
  const ffmpegPath = getFfmpegBinaryPath(pluginPath);

  try {
    await access(ffmpegPath, fsConstants.X_OK);
    return ffmpegPath;
  } catch {
    throw new Error(
      `Missing required ffmpeg binary at "${ffmpegPath}". ` +
        'Install ffmpeg in this plugin under bin/ (bin/ffmpeg on Linux/macOS, bin/ffmpeg.exe on Windows).'
    );
  }
};

type TRuntimePlayback = {
  producer: Producer;
  transport: PlainTransport;
  streamHandleRemove: () => void;
  ffmpegPid?: number;
};

const soundsCache: { get: (() => Promise<TSoundEntry[]>) | null; set: ((sounds: TSoundEntry[]) => Promise<void>) | null } = {
  get: null,
  set: null
};
const activePlaybackByUser = new Map<number, TRuntimePlayback>();

type TPublicWriteProbeResult = {
  ok: boolean;
  baseDir: string | null;
  mirrorUrls: string[];
  tried: string[];
  error?: string;
};

let publicWriteProbeResult: TPublicWriteProbeResult = {
  ok: false,
  baseDir: null,
  mirrorUrls: [],
  tried: []
};

let getConfiguredMirrorFileName: (() => Promise<string | null>) | null = null;

const sanitizeMirrorFileName = (value: string | null | undefined) => {
  if (!value) return null;

  const normalized = basename(value.trim());
  if (!normalized || normalized === '.' || normalized === '..') return null;
  return normalized;
};

const getPublicSoundsMirrorPaths = async () => {
  if (!publicWriteProbeResult.ok || !publicWriteProbeResult.baseDir) {
    return { paths: [] as string[], urls: [] as string[] };
  }

  const baseDir = publicWriteProbeResult.baseDir;
  const publicDir = dirname(baseDir);
  const configuredFileName = sanitizeMirrorFileName(await getConfiguredMirrorFileName?.());

  const entries = [
    { path: join(baseDir, 'sounds.json'), url: '/public/soundboard/sounds.json' },
    { path: join(publicDir, 'soundboard-sounds.json'), url: '/public/soundboard-sounds.json' },
    configuredFileName
      ? { path: join(publicDir, configuredFileName), url: `/public/${encodeURIComponent(configuredFileName)}` }
      : null
  ].filter((entry): entry is { path: string; url: string } => Boolean(entry));

  const dedupe = new Map<string, string>();
  for (const entry of entries) {
    if (!dedupe.has(entry.path)) dedupe.set(entry.path, entry.url);
  }

  return {
    paths: Array.from(dedupe.keys()),
    urls: Array.from(dedupe.values())
  };
};

const syncPublicSoundsMirror = async (ctx: PluginContext, sounds: TSoundEntry[]) => {
  const { paths, urls } = await getPublicSoundsMirrorPaths();
  if (paths.length === 0) return;

  const payload = JSON.stringify({ sounds });

  for (const mirrorPath of paths) {
    try {
      await writeFile(mirrorPath, payload, 'utf8');
    } catch (error) {
      ctx.debug('[soundboard] could not write public sounds mirror', { mirrorPath, error });
    }
  }

  publicWriteProbeResult = {
    ...publicWriteProbeResult,
    mirrorUrls: urls
  };
};

const parseSounds = (raw: unknown): TSoundEntry[] => {
  if (typeof raw !== 'string' || raw.length === 0) return [];

  try {
    const parsed = JSON.parse(raw) as TSoundEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) =>
      entry &&
      typeof entry.id === 'string' &&
      typeof entry.name === 'string' &&
      typeof entry.emoji === 'string' &&
      typeof entry.mimeType === 'string' &&
      (typeof entry.sourceUrl === 'string' || typeof entry.dataBase64 === 'string') &&
      typeof entry.createdByUserId === 'number' &&
      typeof entry.createdAt === 'number'
    );
  } catch {
    return [];
  }
};


const probePublicWriteAccess = async (ctx: PluginContext): Promise<TPublicWriteProbeResult> => {
  const envPublicDir = process.env.SHARKORD_PUBLIC_DIR?.trim();
  const candidates = [
    envPublicDir,
    join(ctx.path, '..', '..', 'public'),
    join(ctx.path, '..', 'public'),
    '/public'
  ].filter((value): value is string => Boolean(value));

  const tried: string[] = [];

  for (const candidate of candidates) {
    const baseDir = join(candidate, 'soundboard');
    const probePath = join(baseDir, 'write-probe.json');

    try {
      tried.push(baseDir);
      await mkdir(baseDir, { recursive: true });
      await access(baseDir, fsConstants.W_OK);
      await writeFile(
        probePath,
        JSON.stringify({ ok: true, createdAt: Date.now(), pluginPath: ctx.path })
      );
      await rm(probePath, { force: true });

      const result: TPublicWriteProbeResult = {
        ok: true,
        baseDir,
        mirrorUrls: [],
        tried
      };
      publicWriteProbeResult = result;
      ctx.log(`[soundboard] public write probe succeeded at: ${baseDir}`);
      return result;
    } catch (error) {
      ctx.debug(`[soundboard] public write probe failed at: ${baseDir}`, error);
    }
  }

  const result: TPublicWriteProbeResult = {
    ok: false,
    baseDir: null,
    mirrorUrls: [],
    tried,
    error: 'No writable public/soundboard directory found.'
  };

  publicWriteProbeResult = result;
  ctx.log(
    `[soundboard] public write probe failed for all candidate paths. Tried: ${tried.join(', ') || 'none'}`
  );

  return result;
};

const stopPlaybackForUser = (ctx: PluginContext, userId: number) => {
  const playback = activePlaybackByUser.get(userId);
  if (!playback) return;

  playback.streamHandleRemove();
  playback.producer.close();
  playback.transport.close();

  if (playback.ffmpegPid) {
    try {
      process.kill(playback.ffmpegPid, 'SIGTERM');
    } catch (error) {
      ctx.debug('Could not stop ffmpeg process', error);
    }
  }

  activePlaybackByUser.delete(userId);
};

const onLoad = async (ctx: PluginContext) => {
  ctx.log('Soundboard plugin loaded');
  ctx.log('Initializing soundboard plugin UI and command handlers');
  const ffmpegBinaryPath = await assertFfmpegBinary(ctx.path);
  ctx.log(`Using ffmpeg binary at: ${ffmpegBinaryPath}`);
  await probePublicWriteAccess(ctx);

  const settings = await ctx.settings.register([
    {
      key: SOUNDS_SETTINGS_KEY,
      name: 'Shared soundboard data (JSON)',
      description: 'Managed by the soundboard plugin. Do not edit manually.',
      type: 'string',
      defaultValue: '[]'
    },
    {
      key: PUBLIC_MIRROR_FILENAME_SETTINGS_KEY,
      name: 'Public mirror filename',
      description: 'Optional. Public filename to mirror sounds JSON into (for example: uploaded-sounds.json).',
      type: 'string',
      defaultValue: 'soundboard-sounds.json'
    }
  ] as const);

  getConfiguredMirrorFileName = async () => settings.get(PUBLIC_MIRROR_FILENAME_SETTINGS_KEY);

  soundsCache.get = async () => parseSounds(await settings.get(SOUNDS_SETTINGS_KEY));
  soundsCache.set = async (sounds: TSoundEntry[]) => {
    await settings.set(SOUNDS_SETTINGS_KEY, JSON.stringify(sounds));
    await syncPublicSoundsMirror(ctx, sounds);
  };

  await syncPublicSoundsMirror(ctx, await soundsCache.get());

  ctx.log('Enabling plugin UI components');
  ctx.ui.enable();
  ctx.log('Plugin UI enabled');

  ctx.actions.register({
    name: 'list_sounds',
    async execute() {
      ctx.debug('Action list_sounds invoked');
      const sounds = await soundsCache.get!();
      const payload: TListSoundsResponse = { sounds };
      return payload;
    }
  });



  ctx.actions.register({
    name: 'upload_sound',
    async execute(invokerCtx: TInvokerContext, payload: { name: string; emoji: string; url: string; id?: string }) {
      ctx.debug('Action upload_sound invoked', {
        userId: invokerCtx.userId,
        name: payload.name,
        emoji: payload.emoji,
        url: payload.url
      });
      const name = payload.name.trim();
      const emoji = payload.emoji.trim();
      const url = payload.url.trim();

      if (!name) throw new Error('Sound name is required.');
      if (!emoji) throw new Error('An emoji is required.');
      if (!url) throw new Error('A file URL is required.');
      if (!/^https?:\/\//i.test(url)) throw new Error('URL must start with http:// or https://');

      let mimeType = 'audio/mpeg';

      try {
        const headResponse = await fetch(url, { method: 'HEAD' });
        if (headResponse.ok) {
          const contentLength = headResponse.headers.get('content-length');
          if (contentLength && Number(contentLength) > MAX_FILE_SIZE_BYTES) {
            throw new Error(`Sound file too large. Max size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`);
          }

          const rawContentType = headResponse.headers.get('content-type');
          if (rawContentType) {
            mimeType = rawContentType.split(';')[0]?.trim() || mimeType;
          }
        }
      } catch (error) {
        ctx.debug('Could not validate sound URL via HEAD request, continuing with URL reference', error);
      }

      const sounds = await soundsCache.get!();
      const soundId = payload.id?.trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const nextSound: TSoundEntry = {
        id: soundId,
        name,
        emoji,
        mimeType,
        sourceUrl: url,
        createdByUserId: invokerCtx.userId,
        createdAt: Date.now()
      };

      sounds.push(nextSound);
      await soundsCache.set!(sounds);

      return nextSound;
    }
  });

  ctx.actions.register({
    name: 'play_sound',
    async execute(invokerCtx: TInvokerContext, payload: { soundId: string }) {
      ctx.debug('Action play_sound invoked', {
        userId: invokerCtx.userId,
        currentVoiceChannelId: invokerCtx.currentVoiceChannelId,
        soundId: payload.soundId
      });
      if (!invokerCtx.currentVoiceChannelId) {
        throw new Error('Join a voice channel before using the soundboard.');
      }

      const channelId = invokerCtx.currentVoiceChannelId;
      const sounds = await soundsCache.get!();
      const sound = sounds.find((entry) => entry.id === payload.soundId);
      if (!sound) throw new Error('Sound not found.');

      stopPlaybackForUser(ctx, invokerCtx.userId);

      const router = ctx.voice.getRouter(channelId);
      const { announcedAddress, ip } = ctx.voice.getListenInfo();

      const transport = await router.createPlainTransport({
        listenIp: {
          ip,
          announcedIp: announcedAddress
        },
        rtcpMux: true,
        comedia: true,
        enableSrtp: false
      });

      const audioSsrc = Math.floor(Math.random() * 1_000_000_000);

      const producer = await transport.produce({
        kind: 'audio',
        rtpParameters: {
          codecs: [
            {
              mimeType: 'audio/opus',
              payloadType: RTP_AUDIO_PAYLOAD_TYPE,
              clockRate: 48000,
              channels: 2,
              parameters: {
                useinbandfec: 1,
                minptime: 10
              },
              rtcpFeedback: []
            }
          ],
          encodings: [{ ssrc: audioSsrc }]
        }
      });

      const streamHandle = ctx.voice.createStream({
        channelId,
        title: `🔊 ${sound.name}`,
        key: `soundboard-${invokerCtx.userId}`,
        producers: { audio: producer }
      });

      const tmpDir = join(tmpdir(), 'sharkord-soundboard');
      await mkdir(tmpDir, { recursive: true });
      const fileExt = sound.mimeType.includes('ogg') ? 'ogg' : sound.mimeType.includes('wav') ? 'wav' : 'mp3';
      const inputPath = join(tmpDir, `sound-${invokerCtx.userId}-${Date.now()}.${fileExt}`);

      if (sound.sourceUrl) {
        const response = await fetch(sound.sourceUrl);
        if (!response.ok) {
          throw new Error(`Could not fetch sound URL for playback (HTTP ${response.status}).`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
          throw new Error(`Sound file too large. Max size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`);
        }

        await writeFile(inputPath, Buffer.from(arrayBuffer));
      } else if (sound.dataBase64) {
        await writeFile(inputPath, Buffer.from(sound.dataBase64, 'base64'));
      } else {
        throw new Error('Sound has no playable source.');
      }

      const inputSource = inputPath;

      const ffmpeg = spawn(ffmpegBinaryPath, [
        '-re',
        '-i',
        inputSource,
        '-vn',
        '-ac',
        '2',
        '-ar',
        '48000',
        '-c:a',
        'libopus',
        '-application',
        'audio',
        '-payload_type',
        `${RTP_AUDIO_PAYLOAD_TYPE}`,
        '-ssrc',
        `${audioSsrc}`,
        '-f',
        'rtp',
        `rtp://${ip}:${transport.tuple.localPort}?pkt_size=1200`
      ]);

      const playback: TRuntimePlayback = {
        producer,
        transport,
        streamHandleRemove: streamHandle.remove,
        ffmpegPid: ffmpeg.pid
      };

      activePlaybackByUser.set(invokerCtx.userId, playback);
      ctx.log('Started ffmpeg playback', {
        userId: invokerCtx.userId,
        channelId,
        ffmpegPid: ffmpeg.pid
      });

      ffmpeg.stderr.on('data', (chunk) => {
        ctx.debug('ffmpeg stderr', String(chunk));
      });

      ffmpeg.on('exit', async () => {
        ctx.log('ffmpeg playback ended', {
          userId: invokerCtx.userId,
          channelId,
          ffmpegPid: ffmpeg.pid
        });
        stopPlaybackForUser(ctx, invokerCtx.userId);
      });

      return { ok: true };
    }
  });
};

const onUnload = (ctx: PluginContext) => {
  for (const userId of activePlaybackByUser.keys()) {
    stopPlaybackForUser(ctx, userId);
  }

  ctx.ui.disable();
  ctx.log('Soundboard plugin unloaded');
};

export { onLoad, onUnload };
