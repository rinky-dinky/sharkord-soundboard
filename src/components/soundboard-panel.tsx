import { useCallback, useEffect, useState } from 'react';
import type { TListSoundsResponse, TSoundEntry } from '../types';

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

const SoundboardPanel = () => {
  const { state, actions } = useSharkordStore();
  const { currentVoiceChannelId } = state;
  const { executePluginAction } = actions;

  const [sounds, setSounds] = useState<TSoundEntry[]>([]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🦈');
  const [sourceUrl, setSourceUrl] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!sourceUrl.trim()) {
      setError('Paste a file URL first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const newSound = await executePluginAction<TSoundEntry>('upload_sound', {
        name,
        emoji,
        url: sourceUrl.trim()
      });

      setSounds((prev) => [newSound, ...prev.filter((item) => item.id !== newSound.id)]);
      setSourceUrl('');
      setName('');
      setShowEmojiPicker(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [emoji, executePluginAction, name, sourceUrl]);

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
            value={sourceUrl}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSourceUrl(e.target.value)}
            placeholder="Direct file URL (https://...)"
            className="rounded border bg-transparent px-2 py-1"
          />
          <button
            type="button"
            disabled={!sourceUrl || !name || !emoji || loading}
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
