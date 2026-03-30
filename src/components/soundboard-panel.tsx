import { useCallback, useEffect, useRef, useState } from 'react';
import type { TListSoundsResponse, TSoundInfo } from '../types';

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

const useSharkordStore = () => {
  const store = window.__SHARKORD_STORE__;
  const [state, setState] = useState(() => store.getState());

  useEffect(() => {
    return store.subscribe(() => setState(store.getState()));
  }, [store]);

  return { state, actions: store.actions };
};

// Inline edit card shown in the main grid when edit mode is active.
// Name saves on blur or Enter; emoji saves immediately on pick; delete requires two taps.
const EditableCard = ({
  sound,
  disabled,
  onDelete,
  onUpdate
}: {
  sound: TSoundInfo;
  disabled: boolean;
  onDelete: () => Promise<void>;
  onUpdate: (name: string, emoji: string) => Promise<void>;
}) => {
  const [localName, setLocalName] = useState(sound.name);
  const [localEmoji, setLocalEmoji] = useState(sound.emoji);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local state in sync if the parent updates the sound (e.g. after save)
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
    if (!trimmed) {
      setLocalName(sound.name); // reset if cleared
      return;
    }
    if (trimmed !== sound.name || localEmoji !== sound.emoji) {
      onUpdate(trimmed, localEmoji).catch(() => {
        setLocalName(sound.name);
        setLocalEmoji(sound.emoji);
      });
    }
  };

  const handleEmojiPick = (emoji: string) => {
    setLocalEmoji(emoji);
    setShowEmojiPicker(false);
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

        {/* Emoji picker toggle */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker((v) => !v)}
          aria-expanded={showEmojiPicker}
          aria-label="Pick emoji"
          className="shrink-0 flex h-7 w-7 items-center justify-center rounded border text-base hover:bg-accent"
        >
          {localEmoji}
        </button>

        {/* Name input */}
        <input
          value={localName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalName(e.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setLocalName(sound.name);
              e.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 rounded border bg-transparent px-1.5 py-0.5 text-sm"
        />
      </div>

      {showEmojiPicker ? (
        <div className="grid grid-cols-8 gap-1 rounded border p-1.5">
          {EMOJI_OPTIONS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={`rounded px-1 py-1 text-base hover:bg-accent ${localEmoji === candidate ? 'bg-accent' : ''}`}
              onClick={() => handleEmojiPick(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const SoundboardPanel = ({ isEditing }: { isEditing: boolean }) => {
  const { state, actions } = useSharkordStore();
  const { currentVoiceChannelId } = state;
  const { executePluginAction } = actions;

  const [sounds, setSounds] = useState<TSoundInfo[]>([]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🦈');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!file) {
      setError('Select an audio file first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1] ?? '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const newSound = await executePluginAction<TSoundInfo>('upload_sound', {
        name,
        emoji,
        fileData,
        mimeType: file.type || 'audio/mpeg'
      });

      setSounds((prev) => [newSound, ...prev.filter((item) => item.id !== newSound.id)]);
      setFile(null);
      setName('');
      setShowEmojiPicker(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [emoji, executePluginAction, file, name]);

  const onPlay = useCallback(
    async (soundId: string) => {
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
    },
    [executePluginAction]
  );

  const onDelete = useCallback(
    async (soundId: string) => {
      setError(null);
      try {
        await executePluginAction('delete_sound', { soundId });
        setSounds((prev) => prev.filter((entry) => entry.id !== soundId));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [executePluginAction]
  );

  const onUpdate = useCallback(
    async (soundId: string, name: string, emoji: string) => {
      setError(null);
      try {
        const updated = await executePluginAction<TSoundInfo>('update_sound', { soundId, name, emoji });
        setSounds((prev) => prev.map((s) => (s.id === soundId ? updated : s)));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [executePluginAction]
  );

  return (
    <div className="w-full h-full p-4 flex flex-col gap-3 overflow-auto">
      {!isEditing ? (
        <>
          <p className="text-sm opacity-70">
            {currentVoiceChannelId
              ? 'Click a sound to play it in your active voice call.'
              : 'Join a voice call to play sounds.'}
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
        </>
      ) : (
        <>
          <p className="text-sm opacity-70">Edit names and emojis. Tap the trash icon twice to delete.</p>
          <div className="flex flex-col gap-2">
            {sounds.length === 0 ? (
              <p className="text-sm opacity-60">No sounds yet.</p>
            ) : (
              sounds.map((sound) => (
                <EditableCard
                  key={sound.id}
                  sound={sound}
                  disabled={loading}
                  onDelete={() => onDelete(sound.id)}
                  onUpdate={(n, e) => onUpdate(sound.id, n, e)}
                />
              ))
            )}
          </div>
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
            <button
              type="button"
              className="inline-flex h-9 min-h-9 w-9 min-w-9 shrink-0 items-center justify-center rounded border p-0 text-xl leading-none hover:bg-accent"
              onClick={() => setShowEmojiPicker((v) => !v)}
              title="Pick emoji"
              aria-label="Pick emoji"
              aria-expanded={showEmojiPicker}
            >
              {emoji}
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
