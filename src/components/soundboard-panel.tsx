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

// Two-tap confirm delete button: first click arms it (shows "Confirm?"),
// second click within 3 s executes; otherwise it disarms automatically.
const DeleteButton = ({
  onDelete,
  disabled
}: {
  onDelete: () => Promise<void>;
  disabled: boolean;
}) => {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = async () => {
    if (!armed) {
      setArmed(true);
      timerRef.current = setTimeout(() => setArmed(false), 3000);
    } else {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setArmed(false);
      await onDelete();
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={`shrink-0 rounded border px-2 py-0.5 text-xs disabled:opacity-50 ${
        armed ? 'border-red-500 text-red-500' : 'opacity-60 hover:opacity-100'
      }`}
    >
      {armed ? 'Confirm?' : 'Delete'}
    </button>
  );
};

const SoundboardPanel = () => {
  const { state, actions } = useSharkordStore();
  const { currentVoiceChannelId } = state;
  const { executePluginAction } = actions;

  const [sounds, setSounds] = useState<TSoundInfo[]>([]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🦈');
  const [file, setFile] = useState<File | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
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
          // result is "data:<mimeType>;base64,<data>" — strip the prefix
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

  return (
    <div className="w-full h-full p-4 flex flex-col gap-3 overflow-auto">
      <p className="text-sm opacity-70">
        {currentVoiceChannelId ? 'Click a sound to play it in your active voice call.' : 'Join a voice call to play sounds.'}
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
              {emoji || '😀'}
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

      <details className="border rounded-md p-2" open={false}>
        <summary className="cursor-pointer select-none font-medium">Manage Sounds</summary>
        <div className="mt-2 flex flex-col gap-1">
          {sounds.length === 0 ? (
            <p className="text-sm opacity-60">No sounds yet.</p>
          ) : (
            sounds.map((sound) => (
              <div key={sound.id} className="flex items-center gap-2 py-0.5">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {sound.emoji} {sound.name}
                </span>
                <DeleteButton
                  disabled={loading}
                  onDelete={() => onDelete(sound.id)}
                />
              </div>
            ))
          )}
        </div>
      </details>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
};

export { SoundboardPanel };
