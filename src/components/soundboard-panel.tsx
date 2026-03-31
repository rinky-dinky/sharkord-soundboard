import { useCallback, useEffect, useRef, useState } from 'react';
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
  const hasCustom = customEmojis.length > 0;

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const customPageCount = Math.ceil(customEmojis.length / CUSTOM_EMOJI_PAGE_SIZE);
  const visibleCustomEmojis = customEmojis.slice(
    customPage * CUSTOM_EMOJI_PAGE_SIZE,
    (customPage + 1) * CUSTOM_EMOJI_PAGE_SIZE,
  );

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Pick emoji"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border hover:bg-accent"
      >
        <EmojiDisplay value={value} className="h-5 w-5" />
      </button>

      {open ? (
        <div className="rounded border bg-background shadow-md">
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
      ) : null}
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
    <div className="flex flex-col gap-1 rounded border p-1.5">
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

const SoundboardPanel = ({ isEditing }: { isEditing: boolean }) => {
  const { state, actions } = useSharkordStore();
  const { currentVoiceChannelId, emojis: customEmojis = [] } = state;
  const { executePluginAction } = actions;

  const [sounds, setSounds] = useState<TSoundInfo[]>([]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🦈');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soundPage, setSoundPage] = useState(0);
  const [editPage, setEditPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const onUpload = useCallback(async () => {
    if (!file) { setError('Select an audio file first.'); return; }
    setLoading(true);
    setError(null);
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => { resolve((reader.result as string).split(',')[1] ?? ''); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const newSound = await executePluginAction<TSoundInfo>('upload_sound', {
        name, emoji, fileData, mimeType: file.type || 'audio/mpeg'
      });

      setSounds((prev) => [newSound, ...prev.filter((item) => item.id !== newSound.id)]);
      // New sound lands on page 1, so reset both views to page 0.
      setSoundPage(0);
      setEditPage(0);
      setFile(null);
      setName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [emoji, executePluginAction, file, name]);

  const onPlay = useCallback(async (soundId: string) => {
    setLoading(true);
    setError(null);
    try {
      await executePluginAction('play_sound', { soundId });
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

  // Clamp pages to valid range (handles deletions that shrink the list).
  const soundPageCount = Math.ceil(sounds.length / SOUNDS_PER_PAGE);
  const clampedSoundPage = Math.min(soundPage, Math.max(0, soundPageCount - 1));
  const visibleSounds = sounds.slice(clampedSoundPage * SOUNDS_PER_PAGE, (clampedSoundPage + 1) * SOUNDS_PER_PAGE);

  const editPageCount = Math.ceil(sounds.length / SOUNDS_PER_PAGE);
  const clampedEditPage = Math.min(editPage, Math.max(0, editPageCount - 1));
  const visibleEditSounds = sounds.slice(clampedEditPage * SOUNDS_PER_PAGE, (clampedEditPage + 1) * SOUNDS_PER_PAGE);

  return (
    <div className="w-full h-full p-4 flex flex-col gap-3 overflow-auto">
      {!isEditing ? (
        <>
          <p className="text-sm opacity-70">
            {currentVoiceChannelId
              ? 'Click a sound to play it in your active voice call.'
              : 'Join a voice call to play sounds.'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {visibleSounds.map((sound) => (
              <button
                key={sound.id}
                disabled={!currentVoiceChannelId || loading}
                onClick={() => onPlay(sound.id)}
                className="rounded border px-2 py-1 text-sm disabled:opacity-50 flex items-center gap-1.5 justify-center"
              >
                <EmojiDisplay value={sound.emoji} className="h-5 w-5 shrink-0" />
                <span className="truncate">{sound.name}</span>
              </button>
            ))}
          </div>
          <PageButtons page={clampedSoundPage} pageCount={soundPageCount} onPage={setSoundPage} />
        </>
      ) : (
        <>
          <p className="text-sm opacity-70">Edit names and emojis. Tap the trash icon twice to delete.</p>
          {sounds.length === 0 ? (
            <p className="text-sm opacity-60">No sounds yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {visibleEditSounds.map((sound) => (
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
              <PageButtons page={clampedEditPage} pageCount={editPageCount} onPage={setEditPage} />
            </>
          )}
        </>
      )}

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
            <EmojiPicker value={emoji} customEmojis={customEmojis} onChange={setEmoji} />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)}
            className="rounded border bg-transparent px-2 py-1 text-sm file:mr-2 file:rounded file:border-0 file:bg-accent file:px-2 file:py-1 file:text-sm"
          />
          {file ? (
            <p className="text-xs opacity-60 truncate">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>
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
      </details>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
};

export { SoundboardPanel };
