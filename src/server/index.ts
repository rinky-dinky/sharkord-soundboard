import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inflateRaw } from 'node:zlib';
import type { PlainTransport, PluginContext, Producer, TInvokerContext } from '@sharkord/plugin-sdk';
import type { TListSoundsResponse, TSoundEntry, TUploadSoundPayload } from '../types';

const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 10;
const RTP_AUDIO_PAYLOAD_TYPE = 111;

const getSoundsDir = (pluginPath: string) => join(pluginPath, 'sounds');
const getSoundsJsonPath = (pluginPath: string) => join(getSoundsDir(pluginPath), 'sounds.json');

const getFfmpegBinaryPath = (pluginPath: string) => {
  const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  return join(pluginPath, 'bin', binaryName);
};

// Maps process.platform + process.arch to an ffbinaries component name.
const getFfbinariesComponent = (): string => {
  const { platform, arch } = process;
  if (platform === 'linux') return arch === 'arm64' ? 'linux-arm64' : 'linux-64';
  if (platform === 'darwin') return arch === 'arm64' ? 'osx-arm64' : 'osx-64';
  if (platform === 'win32') return 'windows-64';
  throw new Error(`Unsupported platform for ffmpeg download: ${platform}`);
};

type TFfbinariesApiResponse = {
  bin: Record<string, { ffmpeg?: string }>;
};

// Minimal zip parser — extracts the first entry whose name ends with `entryName`.
// Handles stored (method 0) and deflated (method 8) entries, which covers all
// ffbinaries zip archives. No shell tools required.
const extractZipEntry = (zipBuf: Buffer, entryName: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    let offset = 0;
    while (offset < zipBuf.length - 30) {
      if (zipBuf.readUInt32LE(offset) !== 0x04034b50) break; // local file header signature

      const flags = zipBuf.readUInt16LE(offset + 6);
      const method = zipBuf.readUInt16LE(offset + 8);
      const compressedSize = zipBuf.readUInt32LE(offset + 18);
      const fileNameLen = zipBuf.readUInt16LE(offset + 26);
      const extraLen = zipBuf.readUInt16LE(offset + 28);
      const fileName = zipBuf.subarray(offset + 30, offset + 30 + fileNameLen).toString();
      const dataOffset = offset + 30 + fileNameLen + extraLen;

      if (fileName === entryName || fileName.endsWith(`/${entryName}`)) {
        // bit 3 = sizes are in a data descriptor after the data; scan for it
        if (flags & 0x08) {
          return reject(new Error('zip data descriptor entries are not supported'));
        }
        const compressed = zipBuf.subarray(dataOffset, dataOffset + compressedSize);
        if (method === 0) return resolve(compressed);
        if (method === 8) return inflateRaw(compressed, (err, result) => err ? reject(err) : resolve(result));
        return reject(new Error(`Unsupported zip compression method: ${method}`));
      }

      offset = dataOffset + compressedSize;
    }
    reject(new Error(`Entry "${entryName}" not found in zip archive`));
  });

const downloadFfmpegBinary = async (pluginPath: string, log: (msg: string) => void): Promise<void> => {
  const binDir = join(pluginPath, 'bin');
  await mkdir(binDir, { recursive: true });

  const component = getFfbinariesComponent();

  log(`[soundboard] fetching ffmpeg download URL for ${component}…`);
  const apiRes = await fetch('https://ffbinaries.com/api/v1/version/latest');
  if (!apiRes.ok) throw new Error(`ffbinaries API error: HTTP ${apiRes.status}`);
  const apiData = (await apiRes.json()) as TFfbinariesApiResponse;
  const downloadUrl = apiData.bin[component]?.ffmpeg;
  if (!downloadUrl) throw new Error(`No ffmpeg download URL found for component: ${component}`);

  log(`[soundboard] downloading ffmpeg from ${downloadUrl}…`);
  const dlRes = await fetch(downloadUrl);
  if (!dlRes.ok) throw new Error(`ffmpeg download failed: HTTP ${dlRes.status}`);

  const zipBuf = Buffer.from(await dlRes.arrayBuffer());
  const entryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

  log('[soundboard] extracting ffmpeg binary…');
  const binary = await extractZipEntry(zipBuf, entryName);

  const ffmpegPath = getFfmpegBinaryPath(pluginPath);
  await writeFile(ffmpegPath, binary);

  if (process.platform !== 'win32') {
    await chmod(ffmpegPath, 0o755);
  }

  log(`[soundboard] ffmpeg installed at ${ffmpegPath}`);
};

const ensureFfmpegBinary = async (pluginPath: string, log: (msg: string) => void): Promise<string> => {
  const ffmpegPath = getFfmpegBinaryPath(pluginPath);

  try {
    await access(ffmpegPath, fsConstants.X_OK);
    return ffmpegPath;
  } catch {
    // Not present or not executable — download it
  }

  log('[soundboard] ffmpeg not found in bin/, downloading…');
  await downloadFfmpegBinary(pluginPath, log);

  // Verify the binary is now accessible and executable
  await access(ffmpegPath, fsConstants.X_OK);
  return ffmpegPath;
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
// Legacy migration
//
// v0.0.2 and earlier had two possible data sources:
//
//  1. Plugin settings key "soundsJson" — a JSON string of a plain TSoundEntry
//     array: [{id, name, emoji, mimeType, sourceUrl?, dataBase64?, ...}, ...]
//
//  2. Public mirror files written by syncPublicSoundsMirror — wrapped in an
//     object: {"sounds":[...]}
//     Candidates: <public>/soundboard-sounds.json
//                 <public>/soundboard/sounds.json
//     Where <public> was probed as: $SHARKORD_PUBLIC_DIR, <plugin>/../../public,
//     <plugin>/../public, /public
//
// The settings value is often empty after a server restart (it may not have
// been persisted), so we fall back to reading the public mirror files which
// the user confirmed exist on disk.
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

const isValidLegacyEntry = (entry: unknown): entry is TLegacySoundEntry =>
  entry !== null &&
  typeof entry === 'object' &&
  typeof (entry as Record<string, unknown>).id === 'string' &&
  typeof (entry as Record<string, unknown>).name === 'string' &&
  typeof (entry as Record<string, unknown>).emoji === 'string' &&
  typeof (entry as Record<string, unknown>).mimeType === 'string' &&
  typeof (entry as Record<string, unknown>).createdByUserId === 'number' &&
  typeof (entry as Record<string, unknown>).createdAt === 'number' &&
  (
    typeof (entry as Record<string, unknown>).sourceUrl === 'string' ||
    typeof (entry as Record<string, unknown>).dataBase64 === 'string'
  );

// Parses the plain-array format stored in settings: [{...}, ...]
const parseLegacySettingsArray = (raw: string): TLegacySoundEntry[] => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidLegacyEntry);
  } catch {
    return [];
  }
};

// Parses the wrapped format written by the public mirror: {"sounds":[{...}, ...]}
const parseLegacyPublicJson = (raw: string): TLegacySoundEntry[] => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    const arr = (parsed as Record<string, unknown>).sounds;
    if (!Array.isArray(arr)) return [];
    return arr.filter(isValidLegacyEntry);
  } catch {
    return [];
  }
};

const LEGACY_MIGRATION_MARKER = '.legacy-migration-done';

type TLegacyPublicResult = {
  sounds: TLegacySoundEntry[];
  publicDir: string; // the directory where the JSON file was found
};

// Scans the candidate public directories for the mirror files the old plugin
// wrote, returning the sounds and the resolved public directory so audio files
// can be read from disk instead of fetched over HTTP.
const findLegacyPublicSounds = async (
  ctx: PluginContext
): Promise<TLegacyPublicResult | null> => {
  const envPublicDir = process.env.SHARKORD_PUBLIC_DIR?.trim();
  const publicDirCandidates = [
    envPublicDir,
    join(ctx.path, '..', '..', 'public'),
    join(ctx.path, '..', 'public'),
    '/public'
  ].filter((v): v is string => Boolean(v));

  // The old code wrote to both of these paths inside the public dir
  const relativeFilenames = ['soundboard-sounds.json', join('soundboard', 'sounds.json')];

  for (const dir of publicDirCandidates) {
    for (const rel of relativeFilenames) {
      const fullPath = join(dir, rel);
      try {
        const raw = await readFile(fullPath, 'utf8');
        const sounds = parseLegacyPublicJson(raw);
        ctx.log(`[soundboard] found legacy file at ${fullPath} (${sounds.length} valid entries)`);
        if (sounds.length > 0) return { sounds, publicDir: dir };
      } catch {
        ctx.log(`[soundboard] no legacy file at ${fullPath}`);
      }
    }
  }

  return null;
};

// Tries to resolve a sourceUrl to a local file path under publicDir.
// The old plugin served files from the public directory under the URL prefix
// /public/, so https://host/public/foo.mp3 lives at <publicDir>/foo.mp3.
const resolvePublicUrlToFilePath = (sourceUrl: string, publicDir: string): string | null => {
  try {
    const pathname = new URL(sourceUrl).pathname;
    // Strip the leading /public/ URL prefix to get the relative file path
    const relative = pathname.replace(/^\/public\//i, '');
    if (!relative || relative.includes('..')) return null;
    return join(publicDir, relative);
  } catch {
    return null;
  }
};

const migrateLegacy = async (ctx: PluginContext): Promise<void> => {
  // Use a dedicated marker file so this gate is independent of sounds.json.
  // sounds.json is created whenever a new sound is uploaded, which would
  // otherwise cause the migration to be silently skipped on every restart.
  const markerPath = join(getSoundsDir(ctx.path), LEGACY_MIGRATION_MARKER);
  try {
    await access(markerPath, fsConstants.F_OK);
    ctx.log('[soundboard] legacy migration already completed, skipping');
    return;
  } catch {
    // marker absent — proceed
  }

  ctx.log('[soundboard] checking for legacy sounds to migrate…');

  // Try settings first (plain JSON array stored under key "soundsJson")
  let legacySounds: TLegacySoundEntry[] = [];

  try {
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
    legacySounds = parseLegacySettingsArray(raw);

    if (legacySounds.length > 0) {
      ctx.log(`[soundboard] found ${legacySounds.length} sound(s) in legacy settings`);
      legacySettings.set('soundsJson', '[]');
    } else {
      ctx.log('[soundboard] legacy settings key is empty, trying public mirror files…');
    }
  } catch (error) {
    ctx.log(`[soundboard] could not read legacy settings (${String(error)}), trying public mirror files…`);
  }

  // Fall back to the public mirror files if settings were empty
  let legacyPublicDir: string | null = null;
  if (legacySounds.length === 0) {
    const result = await findLegacyPublicSounds(ctx);
    if (result) {
      legacySounds = result.sounds;
      legacyPublicDir = result.publicDir;
    }
  }

  if (legacySounds.length === 0) {
    ctx.log('[soundboard] no legacy sounds found — writing migration marker and continuing');
    await writeFile(markerPath, String(Date.now()), 'utf8');
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
        // Prefer reading from disk — the files live in the same public directory
        // we already found the JSON in, so an HTTP round-trip is unnecessary and
        // can fail (e.g. 502) when the server makes requests to itself.
        if (legacyPublicDir) {
          const localFilePath = resolvePublicUrlToFilePath(old.sourceUrl, legacyPublicDir);
          if (localFilePath) {
            try {
              fileBuffer = await readFile(localFilePath);
              ctx.log(`[soundboard] read "${old.name}" from ${localFilePath}`);
            } catch {
              ctx.log(`[soundboard] "${old.name}" not at ${localFilePath}, falling back to HTTP`);
            }
          }
        }

        if (!fileBuffer) {
          ctx.log(`[soundboard] fetching "${old.name}" from ${old.sourceUrl}`);
          const response = await fetch(old.sourceUrl);
          if (!response.ok) {
            ctx.log(`[soundboard] fetch failed for "${old.name}" (HTTP ${response.status}) — skipping`);
            continue;
          }
          fileBuffer = Buffer.from(await response.arrayBuffer());
        }
      }

      if (!fileBuffer) continue;

      if (fileBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
        ctx.log(`[soundboard] "${old.name}" exceeds size limit — skipping`);
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

      ctx.log(`[soundboard] migrated "${old.name}" (${old.id})`);
    } catch (error) {
      ctx.log(`[soundboard] error migrating "${old.name}": ${String(error)}`);
    }
  }

  // Merge with any sounds already in the new system (old sounds first so
  // they keep their original order; skip any whose id already exists)
  if (migratedSounds.length > 0) {
    const existingSounds = await loadSounds(ctx.path);
    const existingIds = new Set(existingSounds.map((s) => s.id));
    const toAdd = migratedSounds.filter((s) => !existingIds.has(s.id));
    await saveSounds(ctx.path, [...toAdd, ...existingSounds]);
    ctx.log(
      `[soundboard] migration complete: ${toAdd.length} sound(s) added` +
        (migratedSounds.length - toAdd.length > 0
          ? `, ${migratedSounds.length - toAdd.length} already present`
          : '')
    );
  } else {
    // Don't write the marker — let migration retry on the next startup so that
    // a transient failure (e.g. a self-request 502) doesn't permanently block it.
    ctx.log('[soundboard] migration ran but no sounds could be imported; will retry on next startup');
    return;
  }

  // Only mark done once at least one sound was successfully imported
  await writeFile(markerPath, String(Date.now()), 'utf8');
};

// ---------------------------------------------------------------------------

type TRuntimePlayback = {
  playbackId: string;
  soundId: string;
  userId: number;
  producer: Producer;
  transport: PlainTransport;
  streamHandleRemove: () => void;
  ffmpegPid?: number;
};

const activePlaybacks = new Map<string, TRuntimePlayback>();

// ---------------------------------------------------------------------------
// Pre-warm: one RTP transport+producer+stream per user, created while the
// user is browsing the soundboard so the consumer is already subscribed by
// the time they hit a button.
// ---------------------------------------------------------------------------

type TWarmup = {
  transport: PlainTransport;
  producer: Producer;
  streamHandleRemove: () => void;
  channelId: number;
  audioSsrc: number;
  ip: string;
  ready: boolean;
};

const warmupByUser = new Map<number, TWarmup>();

const teardownWarmupForUser = (ctx: PluginContext, userId: number) => {
  const warmup = warmupByUser.get(userId);
  if (!warmup) return;
  warmup.streamHandleRemove();
  warmup.producer.close();
  warmup.transport.close();
  warmupByUser.delete(userId);
};

// Creates a transport+producer+stream for userId in channelId and waits for a
// consumer to subscribe. On success the result is stored in warmupByUser and
// play_sound can use it without any delay.
const startWarmup = async (ctx: PluginContext, userId: number, channelId: number): Promise<void> => {
  teardownWarmupForUser(ctx, userId);

  const router = ctx.voice.getRouter(channelId);
  const { announcedAddress, ip } = ctx.voice.getListenInfo();

  let transport: PlainTransport | undefined;
  try {
    transport = await router.createPlainTransport({
      listenIp: { ip, announcedIp: announcedAddress },
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
            parameters: { useinbandfec: 1, minptime: 10 },
            rtcpFeedback: []
          }
        ],
        encodings: [{ ssrc: audioSsrc }]
      }
    });

    const streamHandle = ctx.voice.createStream({
      channelId,
      title: 'SFX',
      key: `soundboard-warmup-${userId}`,
      producers: { audio: producer }
    });

    // Store in the map so teardownWarmupForUser can clean up during the wait.
    const warmupEntry: TWarmup = {
      transport,
      producer,
      streamHandleRemove: streamHandle.remove,
      channelId,
      audioSsrc,
      ip,
      ready: false
    };
    warmupByUser.set(userId, warmupEntry);

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 500);
      const obs = (producer as unknown as { observer?: { once(event: 'newconsumer', cb: () => void): void } }).observer;
      obs?.once('newconsumer', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    // Only mark as usable if this warmup wasn't torn down or replaced while waiting.
    if (warmupByUser.get(userId) !== warmupEntry) return;
    warmupEntry.ready = true;

    ctx.debug('SoundDrop warmup ready', { userId, channelId });
  } catch (err) {
    ctx.debug('SoundDrop warmup failed', err);
    transport?.close();
    warmupByUser.delete(userId);
  }
};

const stopPlayback = (ctx: PluginContext, playbackId: string) => {
  const playback = activePlaybacks.get(playbackId);
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

  activePlaybacks.delete(playbackId);
};


const onLoad = async (ctx: PluginContext) => {
  ctx.log('SoundDrop plugin loaded');

  const ffmpegBinaryPath = await ensureFfmpegBinary(ctx.path, ctx.log);
  ctx.log(`Using ffmpeg binary at: ${ffmpegBinaryPath}`);

  await mkdir(getSoundsDir(ctx.path), { recursive: true });
  await migrateLegacy(ctx);

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
    name: 'update_sound',
    async execute(_invokerCtx: TInvokerContext, payload: { soundId: string; name: string; emoji: string }) {
      const name = payload.name.trim();
      const emoji = payload.emoji.trim();
      if (!name) throw new Error('Sound name is required.');
      if (!emoji) throw new Error('An emoji is required.');

      const sounds = await loadSounds(ctx.path);
      const idx = sounds.findIndex((entry) => entry.id === payload.soundId);
      if (idx === -1) throw new Error('Sound not found.');

      sounds[idx] = { ...sounds[idx], name, emoji };
      await saveSounds(ctx.path, sounds);

      const { localPath: _localPath, ...updated } = sounds[idx];
      return updated;
    }
  });

  ctx.actions.register({
    name: 'warmup_soundboard',
    async execute(invokerCtx: TInvokerContext) {
      if (!invokerCtx.currentVoiceChannelId) return { ok: true };
      await startWarmup(ctx, invokerCtx.userId, invokerCtx.currentVoiceChannelId);
      return { ok: true };
    }
  });

  ctx.actions.register({
    name: 'teardown_soundboard',
    async execute(invokerCtx: TInvokerContext) {
      teardownWarmupForUser(ctx, invokerCtx.userId);
      return { ok: true };
    }
  });

  ctx.commands.register({
    name: 'stop_sounds',
    description: 'Stop all currently playing soundboard sounds',
    async execute(_invokerCtx: TInvokerContext) {
      for (const playbackId of [...activePlaybacks.keys()]) {
        stopPlayback(ctx, playbackId);
      }
      return { ok: true };
    }
  });

  ctx.actions.register({
    name: 'stop_sounds',
    async execute(_invokerCtx: TInvokerContext) {
      for (const playbackId of [...activePlaybacks.keys()]) {
        stopPlayback(ctx, playbackId);
      }
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

      const playbackId = `${invokerCtx.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      // Use a pre-warmed setup if one is ready for this user/channel so the
      // consumer is already subscribed and ffmpeg can start without any delay.
      const warmup = warmupByUser.get(invokerCtx.userId);
      const useWarmup = warmup !== undefined && warmup.channelId === channelId && warmup.ready;

      let transport: PlainTransport;
      let producer: Producer;
      let streamHandleRemove: () => void;
      let audioSsrc: number;
      let ip: string;

      if (useWarmup) {
        warmupByUser.delete(invokerCtx.userId);
        // Transfer ownership of the warmup's resources directly to this playback.
        // Do NOT remove and recreate the stream: both attempts showed that removing
        // the warmup stream kills the producer's consumer even when a replacement
        // stream with the same producer exists, leaving ffmpeg with no listener.
        ({ transport, producer, streamHandleRemove, audioSsrc, ip } = warmup);
        // Re-warm in the background so the next click is instant too.
        startWarmup(ctx, invokerCtx.userId, channelId).catch(() => {});
      } else {
        // No warmup available — create on-demand and wait for the consumer.
        teardownWarmupForUser(ctx, invokerCtx.userId);

        const router = ctx.voice.getRouter(channelId);
        const listenInfo = ctx.voice.getListenInfo();
        ip = listenInfo.ip;

        transport = await router.createPlainTransport({
          listenIp: { ip, announcedIp: listenInfo.announcedAddress },
          rtcpMux: true,
          comedia: true,
          enableSrtp: false
        });

        audioSsrc = Math.floor(Math.random() * 1_000_000_000);

        producer = await transport.produce({
          kind: 'audio',
          rtpParameters: {
            codecs: [
              {
                mimeType: 'audio/opus',
                payloadType: RTP_AUDIO_PAYLOAD_TYPE,
                clockRate: 48000,
                channels: 2,
                parameters: { useinbandfec: 1, minptime: 10 },
                rtcpFeedback: []
              }
            ],
            encodings: [{ ssrc: audioSsrc }]
          }
        });

        const streamHandle = ctx.voice.createStream({
          channelId,
          title: `🔊 ${sound.name}`,
          key: `soundboard-${playbackId}`,
          producers: { audio: producer }
        });
        streamHandleRemove = streamHandle.remove;
      }

      const playbackEntry: TRuntimePlayback = {
        playbackId,
        soundId: payload.soundId,
        userId: invokerCtx.userId,
        producer,
        transport,
        streamHandleRemove,
      };
      activePlaybacks.set(playbackId, playbackEntry);

      if (!useWarmup) {
        // Wait for a consumer before sending audio (see startWarmup for rationale).
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 500);
          const obs = (producer as unknown as { observer?: { once(event: 'newconsumer', cb: () => void): void } }).observer;
          obs?.once('newconsumer', () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        if (!activePlaybacks.has(playbackId)) return { ok: true };
      }

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

      playbackEntry.ffmpegPid = ffmpeg.pid;

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
        // Stop only this specific playback, not all playbacks for the user.
        // Previously this called stopPlaybackForUser which could accidentally
        // kill a concurrently-started new playback.
        stopPlayback(ctx, playbackId);
      });

      return { ok: true };
    }
  });

  ctx.actions.register({
    name: 'get_active_playbacks',
    async execute(invokerCtx: TInvokerContext) {
      const activeSoundIds: string[] = [];
      for (const playback of activePlaybacks.values()) {
        if (playback.userId === invokerCtx.userId) {
          activeSoundIds.push(playback.soundId);
        }
      }
      return { activeSoundIds };
    }
  });
};

const onUnload = (ctx: PluginContext) => {
  for (const playbackId of activePlaybacks.keys()) {
    stopPlayback(ctx, playbackId);
  }
  for (const userId of warmupByUser.keys()) {
    teardownWarmupForUser(ctx, userId);
  }
  ctx.ui.disable();
  ctx.log('SoundDrop plugin unloaded');
};

export { onLoad, onUnload };
