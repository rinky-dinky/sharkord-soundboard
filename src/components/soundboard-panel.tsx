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

  const stopPreview = useCallback(() => {
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

  // Stop preview whenever the trim window or volume changes so the user
  // always hears the latest settings when they click preview again.
  useEffect(() => { stopPreview(); }, [trimStart, trimEnd, volume, stopPreview]);
  // Stop and clean up when the component unmounts or file changes.
  useEffect(() => () => stopPreview(), [file, stopPreview]);

  const playPreview = useCallback(() => {
    const buf = decodedBufferRef.current;
    if (!buf) return;
    stopPreview();

    const ctx = new AudioContext();
    const source = ctx.createBufferSource();
    source.buffer = buf;

    const gain = ctx.createGain();
    gain.gain.value = volume / 100;

    source.connect(gain);
    gain.connect(ctx.destination);

    const trimDuration = trimEnd - trimStart;
    source.start(0, trimStart, trimDuration);

    source.onended = () => {
      ctx.close().catch(() => {});
      previewCtxRef.current = null;
      previewSourceRef.current = null;
      setIsPlaying(false);
    };

    previewCtxRef.current = ctx;
    previewSourceRef.current = source;
    setIsPlaying(true);
  }, [trimStart, trimEnd, volume, stopPreview]);

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
        <WaveformEditor
          peaks={peaks}
          duration={duration}
          trimStart={trimStart}
          trimEnd={trimEnd}
          onTrimStartChange={onTrimStartChange}
          onTrimEndChange={onTrimEndChange}
        />
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
            className="flex items-center gap-1 rounded border px-2 py-0.5 hover:bg-accent disabled:opacity-40"
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
            <span>{isPlaying ? 'Stop' : 'Preview'}</span>
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

// Inline edit card shown in the edit grid.
const EditableCard = ({
  sound,
  customEmojis,
  disabled,
  onDelete,
  onUpdate
}: {
  sound: TSoundInfo;
  customEmojis: TPluginEmoji[];
  disabled: boolean;
  onDelete: () => Promise<void>;
  onUpdate: (name: string, emoji: string) => Promise<void>;
}) => {
  const [localName, setLocalName] = useState(sound.name);
  const [localEmoji, setLocalEmoji] = useState(sound.emoji);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalName(sound.name);
    setLocalEmoji(sound.emoji);
  }, [sound.name, sound.emoji]);

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current !== null) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  const handleNameBlur = () => {
    const trimmed = localName.trim();
    if (!trimmed) { setLocalName(sound.name); return; }
    if (trimmed !== sound.name || localEmoji !== sound.emoji) {
      onUpdate(trimmed, localEmoji).catch(() => {
        setLocalName(sound.name);
        setLocalEmoji(sound.emoji);
      });
    }
  };

  const handleEmojiChange = (emoji: string) => {
    setLocalEmoji(emoji);
    onUpdate(localName.trim() || sound.name, emoji).catch(() => setLocalEmoji(sound.emoji));
  };

  const handleDeleteClick = async () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      deleteTimerRef.current = setTimeout(() => setDeleteArmed(false), 3000);
    } else {
      if (deleteTimerRef.current !== null) clearTimeout(deleteTimerRef.current);
      setDeleteArmed(false);
      await onDelete();
    }
  };

  return (
    <div className="sounddrop-cell flex flex-col gap-1 rounded p-1.5">
      <div className="flex gap-1 items-center">
        {/* Trash */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleDeleteClick().catch(() => {})}
          title={deleteArmed ? 'Click again to confirm deletion' : 'Delete sound'}
          className={`shrink-0 flex h-7 w-7 items-center justify-center rounded border disabled:opacity-50 ${
            deleteArmed ? 'border-red-500 text-red-500' : 'opacity-50 hover:opacity-100'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <EmojiPicker value={localEmoji} customEmojis={customEmojis} onChange={handleEmojiChange} />

        <input
          value={localName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalName(e.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { setLocalName(sound.name); e.currentTarget.blur(); }
          }}
          className="min-w-0 flex-1 rounded border bg-transparent px-1.5 py-0.5 text-sm"
        />
      </div>
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

  const onDelete = useCallback(async (soundId: string) => {
    setError(null);
    try {
      await executePluginAction('delete_sound', { soundId });
      setSounds((prev) => prev.filter((entry) => entry.id !== soundId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [executePluginAction]);

  const onUpdate = useCallback(async (soundId: string, name: string, emoji: string) => {
    setError(null);
    try {
      const updated = await executePluginAction<TSoundInfo>('update_sound', { soundId, name, emoji });
      setSounds((prev) => prev.map((s) => (s.id === soundId ? updated : s)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [executePluginAction]);

  return (
    <div className="p-4 flex flex-col gap-3">
      {isEditing && (
        <p className="text-sm opacity-70 shrink-0">Edit names and emojis. Tap the trash icon twice to delete.</p>
      )}
      <div className="sounddrop-scroll overflow-y-auto pr-2 pb-4" style={{ maxHeight: '23.8rem' }}>
        {!isEditing ? (
          <div className="grid grid-cols-2 gap-2" style={{ padding: '2px' }}>
            {sounds.map((sound) => (
              <button
                key={sound.id}
                disabled={!currentVoiceChannelId || loading}
                onClick={() => onPlay(sound.id)}
                className={`sounddrop-cell rounded px-2 py-1 text-sm disabled:opacity-50 flex items-center gap-1.5 justify-center${playingSoundIds.has(sound.id) ? ' sounddrop-playing' : ''}`}
              >
                <EmojiDisplay value={sound.emoji} className="h-5 w-5 shrink-0" />
                <span className="truncate">{sound.name}</span>
              </button>
            ))}
          </div>
        ) : (
          sounds.length === 0 ? (
            <p className="text-sm opacity-60">No sounds yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2" style={{ padding: '2px' }}>
              {sounds.map((sound) => (
                <EditableCard
                  key={sound.id}
                  sound={sound}
                  customEmojis={customEmojis}
                  disabled={loading}
                  onDelete={() => onDelete(sound.id)}
                  onUpdate={(n, e) => onUpdate(sound.id, n, e)}
                />
              ))}
            </div>
          )
        )}
      </div>

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
