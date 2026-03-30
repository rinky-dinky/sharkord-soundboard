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

const EmojiPicker = ({
  value,
  onChange
}: {
  value: string;
  onChange: (emoji: string) => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Pick emoji"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border text-lg hover:bg-accent"
      >
        {value}
      </button>
      {open ? (
        <div className="grid grid-cols-8 gap-1 rounded border p-2">
          {EMOJI_OPTIONS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={`rounded px-1 py-1 text-lg hover:bg-accent ${value === candidate ? 'bg-accent' : ''}`}
              onClick={() => {
                onChange(candidate);
                setOpen(false);
              }}
            >
              {candidate}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

// Each card handles its own edit / delete-confirm state independently.
const SoundCard = ({
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
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(sound.name);
  const [editEmoji, setEditEmoji] = useState(sound.emoji);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setEditName(sound.name);
    setEditEmoji(sound.emoji);
  }, [sound.name, sound.emoji]);

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current !== null) clearTimeout(deleteTimerRef.current);
    };
  }, []);

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

  const handleSave = async () => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    await onUpdate(trimmed, editEmoji);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditName(sound.name);
    setEditEmoji(sound.emoji);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded border p-2">
        <div className="flex gap-1 items-center">
          <EmojiPicker value={editEmoji} onChange={setEditEmoji} />
          <input
            value={editName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') handleSave().catch(() => {});
              if (e.key === 'Escape') handleCancel();
            }}
            className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-sm"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={!editName.trim() || disabled}
            onClick={() => handleSave().catch(() => {})}
            className="flex-1 rounded border px-2 py-0.5 text-xs disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 rounded border px-2 py-0.5 text-xs opacity-60 hover:opacity-100"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded border p-2">
      <span className="truncate text-sm leading-snug">{sound.emoji} {sound.name}</span>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setEditing(true)}
          className="flex-1 rounded border px-2 py-0.5 text-xs opacity-60 hover:opacity-100 disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleDeleteClick().catch(() => {})}
          className={`flex-1 rounded border px-2 py-0.5 text-xs disabled:opacity-50 ${
            deleteArmed ? 'border-red-500 text-red-500' : 'opacity-60 hover:opacity-100'
          }`}
        >
          {deleteArmed ? 'Confirm?' : 'Delete'}
        </button>
      </div>
    </div>
  );
};

const useSharkordStore = () => {
  const store = window.__SHARKORD_STORE__;
  const [state, setState] = useState(() => store.getState());

  useEffect(() => {
    return store.subscribe(() => setState(store.getState()));
  }, [store]);

  return { state, actions: store.actions };
};

const SoundboardPanel = () => {
  const { state, actions } = useSharkordStore();
  const { currentVoiceChannelId } = state;
  const { executePluginAction } = actions;

  const [sounds, setSounds] = useState<TSoundInfo[]>([]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🦈');
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

      <details className="border rounded-md p-2" open={false}>
        <summary className="cursor-pointer select-none font-medium">Manage Sounds</summary>

        {/* Add sound form */}
        <div className="mt-3 flex flex-col gap-2 border-b pb-3">
          <p className="text-xs font-medium opacity-60 uppercase tracking-wide">Add Sound</p>
          <div className="flex gap-2 items-center">
            <input
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="Sound name"
              className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1"
            />
            <EmojiPicker value={emoji} onChange={setEmoji} />
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

        {/* Existing sounds grid */}
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs font-medium opacity-60 uppercase tracking-wide">Existing Sounds</p>
          {sounds.length === 0 ? (
            <p className="text-sm opacity-60">No sounds yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {sounds.map((sound) => (
                <SoundCard
                  key={sound.id}
                  sound={sound}
                  disabled={loading}
                  onDelete={() => onDelete(sound.id)}
                  onUpdate={(n, e) => onUpdate(sound.id, n, e)}
                />
              ))}
            </div>
          )}
        </div>
      </details>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
};

export { SoundboardPanel };
