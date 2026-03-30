import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PlainTransport, PluginContext, Producer, TInvokerContext } from '@sharkord/plugin-sdk';
import type { TListSoundsResponse, TSoundEntry, TUploadSoundPayload } from './types';

const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 2;
const RTP_AUDIO_PAYLOAD_TYPE = 111;

const getSoundsDir = (pluginPath: string) => join(pluginPath, 'sounds');
const getSoundsJsonPath = (pluginPath: string) => join(getSoundsDir(pluginPath), 'sounds.json');

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

const loadSounds = async (pluginPath: string): Promise<TSoundEntry[]> => {
  try {
    const raw = await readFile(getSoundsJsonPath(pluginPath), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is TSoundEntry =>
        entry !== null &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        typeof entry.name === 'string' &&
        typeof entry.emoji === 'string' &&
        typeof entry.mimeType === 'string' &&
        typeof entry.localPath === 'string' &&
        typeof entry.createdByUserId === 'number' &&
        typeof entry.createdAt === 'number'
    );
  } catch {
    return [];
  }
};

const saveSounds = async (pluginPath: string, sounds: TSoundEntry[]): Promise<void> => {
  await writeFile(getSoundsJsonPath(pluginPath), JSON.stringify(sounds, null, 2), 'utf8');
};

const getExtFromMimeType = (mimeType: string): string => {
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('flac')) return 'flac';
  if (mimeType.includes('aac')) return 'aac';
  return 'mp3';
};

// ---------------------------------------------------------------------------
// Legacy migration (v0.0.2 and earlier stored sounds as a JSON string in the
// plugin settings under the key "soundsJson"; each entry had sourceUrl or
// dataBase64 instead of localPath)
// ---------------------------------------------------------------------------

type TLegacySoundEntry = {
  id: string;
  name: string;
  emoji: string;
  mimeType: string;
  sourceUrl?: string;
  dataBase64?: string;
  createdByUserId: number;
  createdAt: number;
};

const parseLegacySounds = (raw: unknown): TLegacySoundEntry[] => {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is TLegacySoundEntry =>
        entry !== null &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        typeof entry.name === 'string' &&
        typeof entry.emoji === 'string' &&
        typeof entry.mimeType === 'string' &&
        typeof entry.createdByUserId === 'number' &&
        typeof entry.createdAt === 'number' &&
        (typeof entry.sourceUrl === 'string' || typeof entry.dataBase64 === 'string')
    );
  } catch {
    return [];
  }
};

const migrateLegacySettings = async (ctx: PluginContext): Promise<void> => {
  // Only run migration if sounds.json does not exist yet
  try {
    await access(getSoundsJsonPath(ctx.path), fsConstants.F_OK);
    return; // already initialised, nothing to do
  } catch {
    // sounds.json absent — check for legacy settings data
  }

  const legacySettings = await ctx.settings.register([
    {
      key: 'soundsJson',
      name: 'Legacy soundboard data (JSON)',
      description: 'Managed by the soundboard plugin. Migrated automatically to the plugin directory.',
      type: 'string',
      defaultValue: '[]'
    }
  ] as const);

  const raw = await legacySettings.get('soundsJson');
  const legacySounds = parseLegacySounds(raw);

  if (legacySounds.length === 0) {
    ctx.debug('[soundboard] no legacy sounds found, skipping migration');
    return;
  }

  ctx.log(`[soundboard] migrating ${legacySounds.length} legacy sound(s) to plugin directory…`);

  const migratedSounds: TSoundEntry[] = [];

  for (const old of legacySounds) {
    try {
      let fileBuffer: Buffer | null = null;

      if (old.dataBase64) {
        fileBuffer = Buffer.from(old.dataBase64, 'base64');
      } else if (old.sourceUrl) {
        const response = await fetch(old.sourceUrl);
        if (!response.ok) {
          ctx.debug(`[soundboard] could not fetch legacy sound URL (HTTP ${response.status})`, { id: old.id });
          continue;
        }
        fileBuffer = Buffer.from(await response.arrayBuffer());
      }

      if (!fileBuffer) continue;

      if (fileBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
        ctx.debug('[soundboard] legacy sound too large, skipping', { id: old.id });
        continue;
      }

      const ext = getExtFromMimeType(old.mimeType);
      const localPath = join(getSoundsDir(ctx.path), `${old.id}.${ext}`);
      await writeFile(localPath, fileBuffer);

      migratedSounds.push({
        id: old.id,
        name: old.name,
        emoji: old.emoji,
        mimeType: old.mimeType,
        localPath,
        createdByUserId: old.createdByUserId,
        createdAt: old.createdAt
      });

      ctx.log(`[soundboard] migrated sound "${old.name}" (${old.id})`);
    } catch (error) {
      ctx.debug('[soundboard] failed to migrate legacy sound', { id: old.id, error });
    }
  }

  if (migratedSounds.length > 0) {
    await saveSounds(ctx.path, migratedSounds);
    ctx.log(`[soundboard] migration complete: ${migratedSounds.length}/${legacySounds.length} sound(s) imported`);
    // Clear the legacy settings value so the migration doesn't re-run
    legacySettings.set('soundsJson', '[]');
  }
};

// ---------------------------------------------------------------------------

type TRuntimePlayback = {
  producer: Producer;
  transport: PlainTransport;
  streamHandleRemove: () => void;
  ffmpegPid?: number;
};

const activePlaybackByUser = new Map<number, TRuntimePlayback>();

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

  const ffmpegBinaryPath = await assertFfmpegBinary(ctx.path);
  ctx.log(`Using ffmpeg binary at: ${ffmpegBinaryPath}`);

  await mkdir(getSoundsDir(ctx.path), { recursive: true });
  await migrateLegacySettings(ctx);

  ctx.ui.enable();

  ctx.actions.register({
    name: 'list_sounds',
    async execute() {
      const sounds = await loadSounds(ctx.path);
      const response: TListSoundsResponse = {
        sounds: sounds.map(({ localPath: _localPath, ...rest }) => rest)
      };
      return response;
    }
  });

  ctx.actions.register({
    name: 'upload_sound',
    async execute(invokerCtx: TInvokerContext, payload: TUploadSoundPayload) {
      const name = payload.name.trim();
      const emoji = payload.emoji.trim();
      const { fileData, mimeType } = payload;

      if (!name) throw new Error('Sound name is required.');
      if (!emoji) throw new Error('An emoji is required.');
      if (!fileData) throw new Error('An audio file is required.');

      const fileBuffer = Buffer.from(fileData, 'base64');
      if (fileBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
        throw new Error(`Sound file too large. Max size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`);
      }

      const soundId = payload.id?.trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ext = getExtFromMimeType(mimeType);
      const localPath = join(getSoundsDir(ctx.path), `${soundId}.${ext}`);

      await writeFile(localPath, fileBuffer);

      const sounds = await loadSounds(ctx.path);
      const newEntry: TSoundEntry = {
        id: soundId,
        name,
        emoji,
        mimeType,
        localPath,
        createdByUserId: invokerCtx.userId,
        createdAt: Date.now()
      };

      sounds.push(newEntry);
      await saveSounds(ctx.path, sounds);

      const { localPath: _localPath, ...newEntryInfo } = newEntry;
      return newEntryInfo;
    }
  });

  ctx.actions.register({
    name: 'delete_sound',
    async execute(_invokerCtx: TInvokerContext, payload: { soundId: string }) {
      const sounds = await loadSounds(ctx.path);
      const sound = sounds.find((entry) => entry.id === payload.soundId);
      if (!sound) throw new Error('Sound not found.');

      try {
        await unlink(sound.localPath);
      } catch {
        // File may already be gone; continue with removing from index
      }

      await saveSounds(ctx.path, sounds.filter((entry) => entry.id !== payload.soundId));
      return { ok: true };
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
      const sounds = await loadSounds(ctx.path);
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

      const ffmpeg = spawn(ffmpegBinaryPath, [
        '-re',
        '-i', sound.localPath,
        '-vn',
        '-ac', '2',
        '-ar', '48000',
        '-c:a', 'libopus',
        '-application', 'audio',
        '-payload_type', `${RTP_AUDIO_PAYLOAD_TYPE}`,
        '-ssrc', `${audioSsrc}`,
        '-f', 'rtp',
        `rtp://${ip}:${transport.tuple.localPort}?pkt_size=1200`
      ]);

      activePlaybackByUser.set(invokerCtx.userId, {
        producer,
        transport,
        streamHandleRemove: streamHandle.remove,
        ffmpegPid: ffmpeg.pid
      });

      ctx.log('Started ffmpeg playback', {
        userId: invokerCtx.userId,
        channelId,
        ffmpegPid: ffmpeg.pid
      });

      ffmpeg.stderr.on('data', (chunk) => {
        ctx.debug('ffmpeg stderr', String(chunk));
      });

      ffmpeg.on('exit', () => {
        ctx.log('ffmpeg playback ended', { userId: invokerCtx.userId, channelId });
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
