import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TPluginEmoji } from '@sharkord/plugin-sdk';
import type { TListSoundsResponse, TSoundInfo } from '../types';

// ---------------------------------------------------------------------------
// Emoji value conventions
//   Native emoji  → unicode string, e.g. "🦈"
//   Custom emoji  → relative URL, e.g. "/public/some-emoji.png"
//                   (with optional ?accessToken=... query string)
// ---------------------------------------------------------------------------

// Five pages of 40 emojis each (8 columns × 5 rows per page).
const NATIVE_EMOJI_PAGES: string[][] = [
  // Page 1 – Smileys
  [
    '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
    '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
    '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪',
    '😝', '🤑', '🤗', '🤭', '🫢', '🫣', '🤫', '🤔',
    '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏',
  ],
  // Page 2 – More faces & hands
  [
    '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤',
    '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵',
    '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓',
    '😱', '😤', '😡', '🤬', '😈', '👿', '💀', '☠️',
    '👋', '🤚', '🖐️', '✋', '🤙', '👍', '👎', '👏',
  ],
  // Page 3 – Sound, music & entertainment
  [
    '🦈', '🔊', '🎵', '🎶', '🎧', '🎤', '📣', '🎚️',
    '🎸', '🥁', '🎷', '🎺', '🎻', '🪕', '🎹', '🪗',
    '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🎯', '🎮',
    '🕹️', '🎲', '♟️', '🎪', '🎭', '🎨', '🎬', '🎼',
    '📻', '📺', '📷', '📸', '🔭', '🔬', '💻', '🖥️',
  ],
  // Page 4 – Animals
  [
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
    '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈',
    '🙉', '🙊', '🐔', '🐧', '🐦', '🦅', '🦆', '🦉',
    '🐺', '🐴', '🦄', '🐝', '🦋', '🐌', '🐞', '🐜',
    '🦎', '🐢', '🐍', '🦕', '🦖', '🐳', '🐬', '🐟',
  ],
  // Page 5 – Food & symbols
  [
    '🍎', '🍊', '🍋', '🍇', '🍓', '🍒', '🍑', '🥝',
    '🍕', '🍔', '🌮', '🍣', '🍜', '🍦', '🍰', '🎂',
    '☕', '🍵', '🍺', '🍻', '🥂', '🍷', '🧃', '🥤',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
    '💯', '✅', '❌', '⚠️', '🔥', '💥', '⭐', '🌟',
  ],
  // Page 6 – Nature & weather
  [
    '🌸', '🌺', '🌻', '🌹', '🌷', '🌼', '🌾', '🍀',
    '🍁', '🍂', '🍃', '🌿', '🌱', '🌲', '🌳', '🌴',
    '🌵', '☘️', '🍄', '🌊', '🌈', '⛅', '🌤️', '🌧️',
    '⛈️', '🌩️', '❄️', '☃️', '⛄', '🌬️', '💨', '🌙',
    '🌑', '🌒', '🌓', '🌔', '🌕', '☀️', '🌝', '🌞',
  ],
  // Page 7 – Travel & places
  [
    '🚀', '✈️', '🚂', '🚗', '🚕', '🚙', '🚌', '🏎️',
    '🛸', '🚁', '⛵', '🚢', '🛳️', '🏖️', '🏝️', '🏔️',
    '🗻', '🌋', '🗼', '🗽', '🏰', '🏯', '🏟️', '🎡',
    '🎢', '🎠', '🌃', '🌆', '🌇', '🌉', '🌁', '🌐',
    '🗺️', '🧭', '🏕️', '⛺', '🛖', '🏠', '🏡', '🏢',
  ],
  // Page 8 – Objects & tools
  [
    '💡', '🔦', '🕯️', '🔑', '🗝️', '🔒', '🔓', '🔨',
    '⚒️', '🛠️', '⛏️', '🪛', '🪚', '🔧', '🪤', '🧲',
    '💣', '🧨', '🪓', '🔮', '🪄', '🧿', '💎', '👑',
    '🎩', '🎓', '👓', '🕶️', '🥽', '💍', '💰', '💵',
    '🪙', '💳', '📱', '⌨️', '🖱️', '🖨️', '📦', '🧰',
  ],
  // Page 9 – Sports & activities
  [
    '⚽', '🏀', '🏈', '⚾', '🥎', '🏐', '🏉', '🎾',
    '🏸', '🏒', '🥊', '🥋', '🏹', '🎣', '🤿', '🎽',
    '🛹', '🛷', '⛸️', '🥌', '🏂', '🪂', '🏋️', '🤸',
    '⛹️', '🏇', '🧗', '🏊', '🚣', '🚴', '🥈', '🥉',
    '🎖️', '🏅', '🎗️', '🏌️', '🧘', '🤺', '🤼', '🤾',
  ],
];

const SOUNDS_PER_PAGE = 20;
const CUSTOM_EMOJI_PAGE_SIZE = 40;

const isCustomEmoji = (value: string) => value.startsWith('/public/');

const customEmojiUrl = (emoji: TPluginEmoji): string => {
  const base = `/public/${emoji.file.name}`;
  if (emoji.file._accessToken) {
    const params = new URLSearchParams({ accessToken: emoji.file._accessToken });
    if (emoji.file._accessTokenExpiresAt !== undefined) {
      params.set('expires', String(emoji.file._accessTokenExpiresAt));
    }
    return `${base}?${params.toString()}`;
  }
  return base;
};

// Renders a single emoji value — either a unicode character or a custom image.
const EmojiDisplay = ({ value, className }: { value: string; className?: string }) =>
  isCustomEmoji(value) ? (
    <img src={value} className={`inline-block object-contain align-middle ${className ?? 'h-5 w-5'}`} alt="" />
  ) : (
    <>{value}</>
  );

// Compact numbered page buttons, hidden when there is only one page.
const PageButtons = ({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) => {
  if (pageCount <= 1) return null;
  return (
    <div className="flex gap-1 justify-center">
      {Array.from({ length: pageCount }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPage(i)}
          className={`h-6 w-6 rounded border text-xs ${page === i ? 'bg-accent font-semibold' : 'opacity-60 hover:bg-accent'}`}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Two-tab emoji picker (Native | Custom).
// The Custom tab is hidden when the server has no custom emojis.
// ---------------------------------------------------------------------------

const EmojiPicker = ({
  value,
  customEmojis,
  onChange
}: {
  value: string;
  customEmojis: TPluginEmoji[];
  onChange: (emoji: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'native' | 'custom'>('native');
  const [nativePage, setNativePage] = useState(0);
  const [customPage, setCustomPage] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasCustom = customEmojis.length > 0;

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = 296;
      const dropdownHeight = 260;
      let top = rect.bottom + 4;
      if (top + dropdownHeight > window.innerHeight - 8) {
        top = rect.top - dropdownHeight - 4;
      }
      let left = rect.left;
      if (left + dropdownWidth > window.innerWidth - 8) {
        left = window.innerWidth - 8 - dropdownWidth;
      }
      setDropdownPos({ top, left });
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (
        !buttonRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const customPageCount = Math.ceil(customEmojis.length / CUSTOM_EMOJI_PAGE_SIZE);
  const visibleCustomEmojis = customEmojis.slice(
    customPage * CUSTOM_EMOJI_PAGE_SIZE,
    (customPage + 1) * CUSTOM_EMOJI_PAGE_SIZE,
  );

  const dropdown = dropdownPos ? (
    <div
      ref={dropdownRef}
      style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: 296, zIndex: 2147483647 }}
      className="rounded border bg-background shadow-md"
      data-emoji-picker-dropdown
    >
      {hasCustom ? (
        <div className="flex border-b text-xs">
          <button
            type="button"
            onClick={() => setTab('native')}
            className={`flex-1 py-1.5 hover:bg-accent ${tab === 'native' ? 'font-semibold' : 'opacity-60'}`}
          >
            Emoji
          </button>
          <button
            type="button"
            onClick={() => setTab('custom')}
            className={`flex-1 py-1.5 hover:bg-accent ${tab === 'custom' ? 'font-semibold' : 'opacity-60'}`}
          >
            Custom
          </button>
        </div>
      ) : null}

      {tab === 'native' || !hasCustom ? (
        <div className="p-2 flex flex-col gap-1.5">
          <div className="grid grid-cols-8 gap-1">
            {NATIVE_EMOJI_PAGES[nativePage].map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => pick(candidate)}
                className={`rounded px-1 py-1 text-lg hover:bg-accent ${value === candidate ? 'bg-accent' : ''}`}
              >
                {candidate}
              </button>
            ))}
          </div>
          <PageButtons page={nativePage} pageCount={NATIVE_EMOJI_PAGES.length} onPage={setNativePage} />
        </div>
      ) : (
        <div className="p-2 flex flex-col gap-1.5">
          <div className="grid grid-cols-8 gap-1">
            {visibleCustomEmojis.map((emoji) => {
              const url = customEmojiUrl(emoji);
              return (
                <button
                  key={emoji.id}
                  type="button"
                  title={emoji.name}
                  onClick={() => pick(url)}
                  className={`rounded p-1 hover:bg-accent ${value === url ? 'bg-accent' : ''}`}
                >
                  <img src={url} className="h-7 w-7 object-contain" alt={emoji.name} />
                </button>
              );
            })}
          </div>
          <PageButtons page={customPage} pageCount={customPageCount} onPage={setCustomPage} />
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-label="Pick emoji"
        className="inline-flex h-8 w-8 items-center justify-center rounded border hover:bg-accent"
      >
        <EmojiDisplay value={value} className="h-5 w-5" />
      </button>
      {open && dropdownPos && createPortal(dropdown, document.body)}
    </div>
  );
};

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Audio helpers
// ---------------------------------------------------------------------------

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};

const parseTime = (str: string): number | null => {
  const match = str.trim().match(/^(\d+):([0-5]?\d(?:\.\d*)?)$/);
  if (!match) return null;
  const mins = parseInt(match[1], 10);
  const secs = parseFloat(match[2]);
  if (secs >= 60) return null;
  return mins * 60 + secs;
};

const writeWavString = (view: DataView, offset: number, str: string): void => {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
};

const encodeWAV = (buffer: AudioBuffer): ArrayBuffer => {
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const dataSize = numSamples * numChannels * 2;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  writeWavString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeWavString(view, 8, 'WAVE');
  writeWavString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeWavString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return ab;
};

// ---------------------------------------------------------------------------
// WaveformEditor: canvas waveform with draggable trim handles
// ---------------------------------------------------------------------------

const WAVEFORM_PEAKS = 200;

const WaveformEditor = ({
  peaks,
  duration,
  trimStart,
  trimEnd,
  onTrimStartChange,
  onTrimEndChange,
}: {
  peaks: number[];
  duration: number;
  trimStart: number;
  trimEnd: number;
  onTrimStartChange: (t: number) => void;
  onTrimEndChange: (t: number) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Keep latest props accessible inside imperative mouse handlers
  const liveRef = useRef({ trimStart, trimEnd, duration, onTrimStartChange, onTrimEndChange });
  useEffect(() => {
    liveRef.current = { trimStart, trimEnd, duration, onTrimStartChange, onTrimEndChange };
  });

  // Redraw whenever peaks or trim positions change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0 || duration <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const startX = (trimStart / duration) * W;
    const endX = (trimEnd / duration) * W;
    const barW = W / peaks.length;
    for (let i = 0; i < peaks.length; i++) {
      const x = i * barW;
      const barH = peaks[i] * H * 0.85;
      const y = (H - barH) / 2;
      const midX = x + barW / 2;
      ctx.fillStyle = midX >= startX && midX <= endX
        ? 'rgba(96,165,250,0.85)'
        : 'rgba(96,165,250,0.25)';
      ctx.fillRect(x + 0.5, y, Math.max(1, barW - 1), barH);
    }
    // Marker lines
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(startX - 1, 0, 2, H);
    ctx.fillRect(endX - 1, 0, 2, H);
  }, [peaks, duration, trimStart, trimEnd]);

  const getTimeAt = (clientX: number): number => {
    const el = containerRef.current;
    if (!el || liveRef.current.duration <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return (x / rect.width) * liveRef.current.duration;
  };

  const startDrag = (handle: 'start' | 'end') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // prevent waveform scrub handler from also firing
    const onMove = (ev: MouseEvent) => {
      const t = getTimeAt(ev.clientX);
      const { trimStart: ts, trimEnd: te, duration: dur, onTrimStartChange: onS, onTrimEndChange: onE } = liveRef.current;
      if (handle === 'start') onS(Math.max(0, Math.min(t, te - 0.05)));
      else onE(Math.min(dur, Math.max(t, ts + 0.05)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startPct = duration > 0 ? (trimStart / duration) * 100 : 0;
  const endPct = duration > 0 ? (trimEnd / duration) * 100 : 100;

  return (
    <div ref={containerRef} className="relative w-full rounded overflow-hidden select-none" style={{ height: 64 }}>
      <canvas
        ref={canvasRef}
        width={600}
        height={64}
        className="block w-full bg-black/10"
        style={{ height: 64 }}
      />
      {/* Dimmed regions outside trim */}
      <div className="absolute inset-y-0 left-0 bg-black/35 pointer-events-none" style={{ width: `${startPct}%` }} />
      <div className="absolute inset-y-0 right-0 bg-black/35 pointer-events-none" style={{ width: `${100 - endPct}%` }} />
      {/* Start handle */}
      <div
        className="absolute inset-y-0 flex items-center justify-center cursor-ew-resize z-10"
        style={{ left: `${startPct}%`, transform: 'translateX(-50%)', width: 16 }}
        onMouseDown={startDrag('start')}
      >
        <div className="absolute inset-y-0" style={{ left: '50%', width: 2, background: 'rgba(255,255,255,0.9)', transform: 'translateX(-50%)' }} />
        <div className="relative w-3 h-3 rounded-full bg-white shadow border border-gray-300" />
      </div>
      {/* End handle */}
      <div
        className="absolute inset-y-0 flex items-center justify-center cursor-ew-resize z-10"
        style={{ left: `${endPct}%`, transform: 'translateX(-50%)', width: 16 }}
        onMouseDown={startDrag('end')}
      >
        <div className="absolute inset-y-0" style={{ left: '50%', width: 2, background: 'rgba(255,255,255,0.9)', transform: 'translateX(-50%)' }} />
        <div className="relative w-3 h-3 rounded-full bg-white shadow border border-gray-300" />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// AudioTrimmer: decodes audio, renders waveform, time inputs, volume slider
// ---------------------------------------------------------------------------

const AudioTrimmer = ({
  file,
  trimStart,
  trimEnd,
  volume,
  onTrimStartChange,
  onTrimEndChange,
  onVolumeChange,
  onReady,
}: {
  file: File;
  trimStart: number;
  trimEnd: number;
  volume: number;
  onTrimStartChange: (t: number) => void;
  onTrimEndChange: (t: number) => void;
  onVolumeChange: (v: number) => void;
  onReady: (duration: number, buffer: AudioBuffer) => void;
}) => {
  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [decoding, setDecoding] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const onReadyRef = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; });

  // Hold the decoded buffer so preview can use it without re-decoding
  const decodedBufferRef = useRef<AudioBuffer | null>(null);
  // Hold the active preview AudioContext + source so we can stop them
  const previewCtxRef = useRef<AudioContext | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  // Direct ref to the playhead DOM element — updated imperatively to avoid
  // triggering React re-renders on every animation frame.
  const playheadRef = useRef<HTMLDivElement | null>(null);

  // Ref-based isPlaying flag so imperative handlers read the latest value
  // without needing to be recreated on every state change.
  const isPlayingRef = useRef(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Ref to the waveform wrapper div — used to calculate scrub position.
  const waveformWrapperRef = useRef<HTMLDivElement | null>(null);

  // --- Shared playback-start logic -----------------------------------
  // Starts (or restarts) audio from `fromTime` (seconds into the buffer).
  // Cancels any in-flight rAF/source before starting fresh.
  const startPlaybackFrom = useCallback((fromTime: number) => {
    const buf = decodedBufferRef.current;
    if (!buf) return;

    // Tear down existing playback without touching isPlaying yet.
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (previewSourceRef.current) {
      try { previewSourceRef.current.stop(); } catch { /* already stopped */ }
      previewSourceRef.current = null;
    }
    if (previewCtxRef.current) {
      previewCtxRef.current.close().catch(() => {});
      previewCtxRef.current = null;
    }

    const clamped = Math.max(trimStart, Math.min(fromTime, trimEnd - 0.05));
    const ctx = new AudioContext();
    const source = ctx.createBufferSource();
    source.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = volume / 100;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0, clamped, trimEnd - clamped);

    // Animate playhead directly via DOM — no React re-renders.
    const startedAt = ctx.currentTime;
    const fullDuration = buf.duration;
    const tick = () => {
      const pos = clamped + (ctx.currentTime - startedAt);
      const pct = Math.min(pos, trimEnd) / fullDuration;
      const el = playheadRef.current;
      if (el) {
        el.style.display = 'block';
        el.style.left = `${pct * 100}%`;
      }
      animFrameRef.current = pos < trimEnd ? requestAnimationFrame(tick) : null;
    };
    animFrameRef.current = requestAnimationFrame(tick);

    source.onended = () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (playheadRef.current) playheadRef.current.style.display = 'none';
      ctx.close().catch(() => {});
      previewCtxRef.current = null;
      previewSourceRef.current = null;
      setIsPlaying(false);
    };

    previewCtxRef.current = ctx;
    previewSourceRef.current = source;
    setIsPlaying(true);
  }, [trimStart, trimEnd, volume]);

  const stopPreview = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (playheadRef.current) playheadRef.current.style.display = 'none';
    if (previewSourceRef.current) {
      try { previewSourceRef.current.stop(); } catch { /* already stopped */ }
      previewSourceRef.current = null;
    }
    if (previewCtxRef.current) {
      previewCtxRef.current.close().catch(() => {});
      previewCtxRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // Stop preview whenever the trim window or volume changes.
  useEffect(() => { stopPreview(); }, [trimStart, trimEnd, volume, stopPreview]);
  // Stop and clean up when the component unmounts or file changes.
  useEffect(() => () => stopPreview(), [file, stopPreview]);

  const playPreview = useCallback(() => {
    if (!decodedBufferRef.current) return;
    stopPreview();
    startPlaybackFrom(trimStart);
  }, [trimStart, stopPreview, startPlaybackFrom]);

  // --- Waveform scrubbing -------------------------------------------
  // Clicking or dragging on the waveform seeks to that position.
  // While dragging the playhead moves visually; audio restarts on mouse-up.
  const handleWaveformMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPlayingRef.current && !decodedBufferRef.current) return;
    const buf = decodedBufferRef.current;
    if (!buf) return;

    const wrapper = waveformWrapperRef.current;
    if (!wrapper) return;

    const getTime = (clientX: number) => {
      const rect = wrapper.getBoundingClientRect();
      const pct = Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
      return Math.max(trimStart, Math.min(pct * buf.duration, trimEnd));
    };

    // Move playhead visually on every mousemove without restarting audio.
    const onMouseMove = (ev: MouseEvent) => {
      const t = getTime(ev.clientX);
      const el = playheadRef.current;
      if (el) {
        el.style.display = 'block';
        el.style.left = `${(t / buf.duration) * 100}%`;
      }
    };

    // On mouse-up: restart audio from the final scrub position.
    const onMouseUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (isPlayingRef.current) {
        startPlaybackFrom(getTime(ev.clientX));
      }
    };

    // Seek immediately on click too.
    if (isPlayingRef.current) startPlaybackFrom(getTime(e.clientX));

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [trimStart, trimEnd, startPlaybackFrom]);

  // Local string values for the time inputs (allows free typing)
  const [startStr, setStartStr] = useState('0:00.0');
  const [endStr, setEndStr] = useState('0:00.0');
  const startFocused = useRef(false);
  const endFocused = useRef(false);
  useEffect(() => { if (!startFocused.current) setStartStr(formatTime(trimStart)); }, [trimStart]);
  useEffect(() => { if (!endFocused.current) setEndStr(formatTime(trimEnd)); }, [trimEnd]);

  // Decode the audio file and generate waveform peaks
  useEffect(() => {
    let cancelled = false;
    setDecoding(true);
    setPeaks([]);
    setDuration(0);
    decodedBufferRef.current = null;

    (async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        if (cancelled) return;
        const audioCtx = new AudioContext();
        let audioBuffer: AudioBuffer;
        try {
          audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        } finally {
          await audioCtx.close();
        }
        if (cancelled) return;

        decodedBufferRef.current = audioBuffer;
        const dur = audioBuffer.duration;
        setDuration(dur);
        onReadyRef.current(dur, audioBuffer);

        // Sample peaks from the first channel
        const data = audioBuffer.getChannelData(0);
        const blockSize = Math.floor(data.length / WAVEFORM_PEAKS);
        const rawPeaks: number[] = [];
        for (let i = 0; i < WAVEFORM_PEAKS; i++) {
          let max = 0;
          const base = i * blockSize;
          for (let j = 0; j < blockSize; j++) {
            const v = Math.abs(data[base + j]);
            if (v > max) max = v;
          }
          rawPeaks.push(max);
        }
        const maxPeak = Math.max(...rawPeaks, 0.0001);
        if (!cancelled) setPeaks(rawPeaks.map((p) => p / maxPeak));
      } catch {
        // If decoding fails just show nothing
      } finally {
        if (!cancelled) setDecoding(false);
      }
    })();

    return () => { cancelled = true; };
  }, [file]);

  const commitStart = (str: string) => {
    const t = parseTime(str);
    if (t !== null) onTrimStartChange(Math.max(0, Math.min(t, trimEnd - 0.05)));
    else setStartStr(formatTime(trimStart));
  };

  const commitEnd = (str: string) => {
    const t = parseTime(str);
    if (t !== null) onTrimEndChange(Math.min(duration, Math.max(t, trimStart + 0.05)));
    else setEndStr(formatTime(trimEnd));
  };

  return (
    <div className="flex flex-col gap-2">
      {decoding ? (
        <div className="h-16 rounded flex items-center justify-center bg-black/10 text-xs opacity-50">
          Loading waveform…
        </div>
      ) : peaks.length > 0 ? (
        <div
          ref={waveformWrapperRef}
          className="relative"
          style={{ height: 64 }}
          onMouseDown={handleWaveformMouseDown}
        >
          <WaveformEditor
            peaks={peaks}
            duration={duration}
            trimStart={trimStart}
            trimEnd={trimEnd}
            onTrimStartChange={onTrimStartChange}
            onTrimEndChange={onTrimEndChange}
          />
          {/* Playhead — positioned as a sibling so WaveformEditor's overflow:hidden
              doesn't clip it; moved imperatively via ref in the rAF loop */}
          <div
            ref={playheadRef}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: 2,
              display: 'none',
              left: '0%',
              transform: 'translateX(-50%)',
              background: 'rgba(255,255,255,0.95)',
              boxShadow: '0 0 4px rgba(255,255,255,0.7)',
              pointerEvents: 'none',
              zIndex: 30,
            }}
          />
        </div>
      ) : (
        <div className="h-16 rounded flex items-center justify-center bg-black/10 text-xs opacity-40">
          Could not load waveform
        </div>
      )}

      {/* Time inputs + preview button */}
      <div className="flex items-center gap-2 text-xs">
        <span className="opacity-60 shrink-0">Start</span>
        <input
          value={startStr}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartStr(e.target.value)}
          onFocus={() => { startFocused.current = true; }}
          onBlur={() => { startFocused.current = false; commitStart(startStr); }}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="w-16 rounded border bg-transparent px-1.5 py-0.5 font-mono text-center"
        />
        <div className="flex-1 flex justify-center">
          <button
            type="button"
            disabled={decoding || !decodedBufferRef.current}
            onClick={isPlaying ? stopPreview : playPreview}
            title={isPlaying ? 'Stop preview' : 'Preview trimmed audio'}
            className="flex items-center justify-center rounded border w-7 h-6 hover:bg-accent disabled:opacity-40"
          >
            {isPlaying ? (
              // Stop square
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect x="1" y="1" width="8" height="8" rx="1" />
              </svg>
            ) : (
              // Play triangle
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <polygon points="2,1 9,5 2,9" />
              </svg>
            )}
          </button>
        </div>
        <span className="opacity-60 shrink-0">End</span>
        <input
          value={endStr}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndStr(e.target.value)}
          onFocus={() => { endFocused.current = true; }}
          onBlur={() => { endFocused.current = false; commitEnd(endStr); }}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="w-16 rounded border bg-transparent px-1.5 py-0.5 font-mono text-center"
        />
      </div>

      {/* Volume slider */}
      <div className="flex items-center gap-2 text-xs">
        <span className="opacity-60 shrink-0">Volume</span>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onVolumeChange(Number(e.target.value))}
          className="flex-1"
          style={{ accentColor: 'rgba(96,165,250,0.9)' }}
        />
        <span className="w-8 text-right font-mono opacity-80">{volume}%</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const useSharkordStore = () => {
  const store = window.__SHARKORD_STORE__;
  const [state, setState] = useState(() => store.getState());

  useEffect(() => {
    return store.subscribe(() => setState(store.getState()));
  }, [store]);

  return { state, actions: store.actions };
};

// ---------------------------------------------------------------------------
// SoundManagePanel: edit name/emoji/volume/trim for an existing sound
// ---------------------------------------------------------------------------

const SoundManagePanel = ({
  sound,
  customEmojis,
  executePluginAction,
  onSaved,
  onDeleted,
}: {
  sound: TSoundInfo;
  customEmojis: TPluginEmoji[];
  executePluginAction: <T>(action: string, payload?: unknown) => Promise<T>;
  onSaved: (updated: TSoundInfo) => void;
  onDeleted: () => void;
}) => {
  const [name, setName] = useState(sound.name);
  const [emoji, setEmoji] = useState(sound.emoji);
  const [volume, setVolume] = useState(Math.round((sound.volume ?? 1) * 100));
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  // Sync fields when the selected sound changes
  useEffect(() => {
    setName(sound.name);
    setEmoji(sound.emoji);
    setVolume(Math.round((sound.volume ?? 1) * 100));
    setAudioFile(null);
    setLoadingAudio(true);
    setLoadError(null);
    setTrimStart(0);
    setTrimEnd(0);
    setAudioDuration(0);
    setSaveError(null);
    audioBufferRef.current = null;
  }, [sound.id]);

  // Fetch the audio from the server so we can render the waveform
  useEffect(() => {
    let cancelled = false;
    setLoadingAudio(true);
    setLoadError(null);

    executePluginAction<{ fileData: string; mimeType: string }>('get_sound_data', { soundId: sound.id })
      .then(({ fileData, mimeType }) => {
        if (cancelled) return;
        // Decode base64 → Blob → File so AudioTrimmer can consume it
        const binary = atob(fileData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mimeType });
        const ext = mimeType.split('/')[1] ?? 'mp3';
        const file = new File([blob], `sound.${ext}`, { type: mimeType });
        setAudioFile(file);
        setLoadingAudio(false);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
          setLoadingAudio(false);
        }
      });

    return () => { cancelled = true; };
  }, [sound.id]);

  useEffect(() => () => {
    if (deleteTimerRef.current !== null) clearTimeout(deleteTimerRef.current);
  }, []);

  const onSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const buffer = audioBufferRef.current;
      const needsTrim = buffer !== null && audioDuration > 0 &&
        (trimStart > 0.01 || trimEnd < audioDuration - 0.01);

      let fileData: string | undefined;
      let mimeType: string | undefined;

      if (needsTrim && buffer) {
        const trimDuration = trimEnd - trimStart;
        const offlineCtx = new OfflineAudioContext(
          Math.min(buffer.numberOfChannels, 2),
          Math.ceil(buffer.sampleRate * trimDuration),
          buffer.sampleRate
        );
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineCtx.destination);
        source.start(0, trimStart, trimDuration);
        const rendered = await offlineCtx.startRendering();
        const wavBuffer = encodeWAV(rendered);
        const bytes = new Uint8Array(wavBuffer);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        fileData = btoa(binary);
        mimeType = 'audio/wav';
      }

      const updated = await executePluginAction<TSoundInfo>('update_sound', {
        soundId: sound.id,
        name: name.trim() || sound.name,
        emoji,
        volume: volume !== 100 ? volume / 100 : undefined,
        ...(fileData ? { fileData, mimeType } : {}),
      });
      onSaved(updated);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      deleteTimerRef.current = setTimeout(() => setDeleteArmed(false), 3000);
    } else {
      if (deleteTimerRef.current !== null) clearTimeout(deleteTimerRef.current);
      setDeleteArmed(false);
      await executePluginAction('delete_sound', { soundId: sound.id });
      onDeleted();
    }
  };

  return (
    <div className="border rounded-md p-2 flex flex-col gap-2 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium opacity-60 flex-1">Manage sound</span>
        <button
          type="button"
          disabled={saving}
          onClick={() => onDelete().catch(() => {})}
          title={deleteArmed ? 'Click again to confirm deletion' : 'Delete sound'}
          className={`flex h-6 w-6 items-center justify-center rounded border disabled:opacity-50 ${
            deleteArmed ? 'border-red-500 text-red-500' : 'opacity-50 hover:opacity-100'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="flex gap-2 items-center">
        <input
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          placeholder="Sound name"
          className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1"
        />
        <EmojiPicker value={emoji} customEmojis={customEmojis} onChange={setEmoji} />
      </div>
      {loadingAudio ? (
        <div className="h-16 rounded flex items-center justify-center bg-black/10 text-xs opacity-50">
          Loading audio…
        </div>
      ) : loadError ? (
        <p className="text-xs text-red-500">{loadError}</p>
      ) : audioFile ? (
        <AudioTrimmer
          file={audioFile}
          trimStart={trimStart}
          trimEnd={trimEnd}
          volume={volume}
          onTrimStartChange={setTrimStart}
          onTrimEndChange={setTrimEnd}
          onVolumeChange={setVolume}
          onReady={(dur, buf) => {
            setAudioDuration(dur);
            audioBufferRef.current = buf;
            setTrimStart(0);
            setTrimEnd(dur);
          }}
        />
      ) : null}
      {saveError ? <p className="text-xs text-red-500">{saveError}</p> : null}
      <button
        type="button"
        disabled={!name.trim() || saving}
        onClick={() => onSave().catch(() => {})}
        className="rounded border px-2 py-1 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------

const SoundboardPanel = ({ isEditing, isAddingSound, onAddSoundDone, onPlayingChange }: { isEditing: boolean; isAddingSound: boolean; onAddSoundDone: () => void; onPlayingChange?: (isPlaying: boolean) => void }) => {
  const { state, actions } = useSharkordStore();
  const { currentVoiceChannelId, emojis: customEmojis = [] } = state;
  const { executePluginAction } = actions;

  const [sounds, setSounds] = useState<TSoundInfo[]>([]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🦈');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingSoundIds, setPlayingSoundIds] = useState<Set<string>>(new Set());
  const [selectedSoundId, setSelectedSoundId] = useState<string | null>(null);
  // Trim / volume state for the Add Sound form
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onPlayingChangeRef = useRef(onPlayingChange);
  useEffect(() => { onPlayingChangeRef.current = onPlayingChange; });

  useEffect(() => {
    const id = 'sounddrop-scrollbar-style';
    const existing = document.getElementById(id);
    const style = existing ?? document.createElement('style');
    style.id = id;
    style.textContent = `
      .sounddrop-scroll { scrollbar-width: thin; scrollbar-color: rgba(128,128,128,0.5) transparent; }
      .sounddrop-scroll::-webkit-scrollbar { width: 2px; }
      .sounddrop-scroll::-webkit-scrollbar-track { background: transparent; box-shadow: none; border: none; }
      .sounddrop-scroll::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.5); border-radius: 0; border: none; box-shadow: none; }
      .sounddrop-scroll::-webkit-scrollbar-button { display: none; height: 0; width: 0; }
      .sounddrop-scroll::-webkit-scrollbar-corner { background: transparent; }
      .sounddrop-cell { background: rgba(128,128,128,0.18) !important; border: 1px solid transparent !important; transition: background 200ms ease, border-color 600ms ease; }
      .sounddrop-cell:not([disabled]):hover, div.sounddrop-cell:hover { background: rgba(128,128,128,0.32) !important; }
      @keyframes sounddrop-shimmer {
        0%   { box-shadow: 0 0 0 1px rgba(239,68,68,0.0); }
        30%  { box-shadow: 0 0 0 1px rgba(239,68,68,0.35), 0 0 3px rgba(239,68,68,0.12); }
        100% { box-shadow: 0 0 0 1px rgba(239,68,68,0.0); }
      }
      .sounddrop-playing {
        animation: sounddrop-shimmer 1.4s ease-in-out infinite;
        border-color: rgba(239,68,68,0.45) !important;
      }
      @keyframes sounddrop-wiggle {
        0%   { transform: rotate(-2deg) translate(-0.5px,  0.5px); }
        25%  { transform: rotate( 2deg) translate( 0.5px, -0.5px); }
        50%  { transform: rotate(-2deg) translate(-0.5px, -0.5px); }
        75%  { transform: rotate( 2deg) translate( 0.5px,  0.5px); }
        100% { transform: rotate(-2deg) translate(-0.5px,  0.5px); }
      }
      .sounddrop-wiggle {
        animation: sounddrop-wiggle 0.38s ease-in-out infinite;
        transform-origin: center center;
      }
      .sounddrop-selected {
        border-color: rgba(96,165,250,0.7) !important;
        background: rgba(96,165,250,0.15) !important;
      }
    `;
    if (!existing) document.head.appendChild(style);
  }, []);

  // Pre-warm the RTP consumer whenever the panel is mounted in a voice channel,
  // or when the user switches channels. This hides the consumer-connection delay
  // behind the time the user spends browsing sounds, so playback feels instant.
  const executePluginActionRef = useRef(executePluginAction);
  useEffect(() => { executePluginActionRef.current = executePluginAction; });
  useEffect(() => {
    if (!currentVoiceChannelId) return;
    executePluginActionRef.current('warmup_soundboard').catch(() => {});
    return () => { executePluginActionRef.current('teardown_soundboard').catch(() => {}); };
  }, [currentVoiceChannelId]);

  useEffect(() => {
    return () => {
      if (playingPollRef.current !== null) {
        clearInterval(playingPollRef.current);
        playingPollRef.current = null;
      }
      onPlayingChangeRef.current?.(false);
    };
  }, []);

  useEffect(() => {
    onPlayingChangeRef.current?.(playingSoundIds.size > 0);
  }, [playingSoundIds]);

  const syncSounds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await executePluginAction<TListSoundsResponse>('list_sounds');
      setSounds(response.sounds);
    } catch (e) {
      setError(`Could not load sounds: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [executePluginAction]);

  useEffect(() => {
    syncSounds().catch(() => {});
  }, [syncSounds]);

  useEffect(() => {
    if (!isAddingSound) {
      setName('');
      setEmoji('🦈');
      setFile(null);
      setTrimStart(0);
      setTrimEnd(0);
      setAudioDuration(0);
      setVolume(100);
      audioBufferRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [isAddingSound]);

  useEffect(() => {
    if (!isEditing) setSelectedSoundId(null);
  }, [isEditing]);

  const onUpload = useCallback(async () => {
    if (!file) { setError('Select an audio file first.'); return; }
    setLoading(true);
    setError(null);
    try {
      let fileData: string;
      let mimeType: string;

      const buffer = audioBufferRef.current;
      const needsTrim = buffer !== null && audioDuration > 0 &&
        (trimStart > 0.01 || trimEnd < audioDuration - 0.01);

      if (needsTrim && buffer) {
        const trimDuration = trimEnd - trimStart;
        const offlineCtx = new OfflineAudioContext(
          Math.min(buffer.numberOfChannels, 2),
          Math.ceil(buffer.sampleRate * trimDuration),
          buffer.sampleRate
        );
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineCtx.destination);
        source.start(0, trimStart, trimDuration);
        const rendered = await offlineCtx.startRendering();
        const wavBuffer = encodeWAV(rendered);
        const bytes = new Uint8Array(wavBuffer);
        // Convert to base64 in chunks to avoid call-stack overflow on large files
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        fileData = btoa(binary);
        mimeType = 'audio/wav';
      } else {
        fileData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => { resolve((reader.result as string).split(',')[1] ?? ''); };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        mimeType = file.type || 'audio/mpeg';
      }

      const newSound = await executePluginAction<TSoundInfo>('upload_sound', {
        name,
        emoji,
        fileData,
        mimeType,
        ...(volume !== 100 ? { volume: volume / 100 } : {}),
      });

      setSounds((prev) => [newSound, ...prev.filter((item) => item.id !== newSound.id)]);
      setFile(null);
      setName('');
      setTrimStart(0);
      setTrimEnd(0);
      setAudioDuration(0);
      setVolume(100);
      audioBufferRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
      onAddSoundDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [emoji, executePluginAction, file, name, onAddSoundDone, trimStart, trimEnd, audioDuration, volume]);

  const restartPoll = useCallback(() => {
    if (playingPollRef.current !== null) clearInterval(playingPollRef.current);
    playingPollRef.current = setInterval(async () => {
      try {
        const result = await executePluginAction<{ activeSoundIds: string[] }>('get_active_playbacks');
        const active = new Set(result.activeSoundIds);
        setPlayingSoundIds((prev) => {
          const next = new Set([...prev].filter((id) => active.has(id)));
          if (next.size === 0 && playingPollRef.current !== null) {
            clearInterval(playingPollRef.current);
            playingPollRef.current = null;
          }
          return next;
        });
      } catch {
        // Ignore poll errors silently.
      }
    }, 750);
  }, [executePluginAction]);

  const restartPollRef = useRef(restartPoll);
  useEffect(() => { restartPollRef.current = restartPoll; });

  // On mount, restore playing state if sounds were active while the panel was closed.
  useEffect(() => {
    executePluginActionRef.current<{ activeSoundIds: string[] }>('get_active_playbacks')
      .then((result) => {
        if (result.activeSoundIds.length > 0) {
          setPlayingSoundIds(new Set(result.activeSoundIds));
          restartPollRef.current();
        }
      })
      .catch(() => {});
  }, []);

  const onPlay = useCallback(async (soundId: string) => {
    setError(null);
    try {
      await executePluginAction('play_sound', { soundId });
      setPlayingSoundIds((prev) => new Set([...prev, soundId]));
      restartPollRef.current();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/sound not found/i.test(message)) {
        setSounds((prev) => prev.filter((entry) => entry.id !== soundId));
        setError('That sound no longer exists and was removed from your local list.');
      } else {
        setError(message);
      }
    }
  }, [executePluginAction]);

  const selectedSound = sounds.find((s) => s.id === selectedSoundId) ?? null;

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="sounddrop-scroll overflow-y-auto pr-2 pb-4" style={{ maxHeight: '23.8rem' }}>
        {sounds.length === 0 && isEditing ? (
          <p className="text-sm opacity-60">No sounds yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2" style={{ padding: '2px' }}>
            {sounds.map((sound, idx) => (
              <button
                key={sound.id}
                disabled={isEditing ? false : (!currentVoiceChannelId || loading)}
                onClick={() => {
                  if (isEditing) {
                    setSelectedSoundId((prev) => prev === sound.id ? null : sound.id);
                  } else {
                    onPlay(sound.id);
                  }
                }}
                className={[
                  'sounddrop-cell rounded px-2 py-1 text-sm flex items-center gap-1.5 justify-center',
                  !isEditing && (playingSoundIds.has(sound.id) ? ' sounddrop-playing' : ''),
                  !isEditing && 'disabled:opacity-50',
                  isEditing && 'sounddrop-wiggle',
                  isEditing && sound.id === selectedSoundId && 'sounddrop-selected',
                ].filter(Boolean).join(' ')}
                style={isEditing ? { animationDelay: `${(idx % 7) * 0.055}s` } : undefined}
              >
                <EmojiDisplay value={sound.emoji} className="h-5 w-5 shrink-0" />
                <span className="truncate">{sound.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {isEditing && selectedSound ? (
        <SoundManagePanel
          sound={selectedSound}
          customEmojis={customEmojis}
          executePluginAction={executePluginAction}
          onSaved={(updated) => {
            setSounds((prev) => prev.map((s) => s.id === updated.id ? updated : s));
            setSelectedSoundId(null);
          }}
          onDeleted={() => {
            setSounds((prev) => prev.filter((s) => s.id !== selectedSoundId));
            setSelectedSoundId(null);
          }}
        />
      ) : null}

      {isAddingSound ? (
        <div className="border rounded-md p-2 flex flex-col gap-2 shrink-0">
          <div className="flex gap-2 items-center">
            <input
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="Sound name"
              className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1"
            />
            <EmojiPicker value={emoji} customEmojis={customEmojis} onChange={setEmoji} />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (!f) {
                setTrimStart(0);
                setTrimEnd(0);
                setAudioDuration(0);
                audioBufferRef.current = null;
              }
            }}
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded border px-2 py-1 text-sm hover:bg-accent truncate"
          >
            {file ? file.name : 'Upload file'}
          </button>
          {file ? (
            <>
              <p className="text-xs opacity-50">{(file.size / 1024).toFixed(1)} KB</p>
              <AudioTrimmer
                file={file}
                trimStart={trimStart}
                trimEnd={trimEnd}
                volume={volume}
                onTrimStartChange={setTrimStart}
                onTrimEndChange={setTrimEnd}
                onVolumeChange={setVolume}
                onReady={(dur, buf) => {
                  setAudioDuration(dur);
                  audioBufferRef.current = buf;
                  setTrimStart(0);
                  setTrimEnd(dur);
                }}
              />
            </>
          ) : null}
          <button
            type="button"
            disabled={!file || !name || !emoji || loading}
            onClick={onUpload}
            className="rounded border px-2 py-1 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
};

export { SoundboardPanel };
