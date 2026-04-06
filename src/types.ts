// Stored in sounds.json on the server; localPath is server-internal and never sent to clients
export type TSoundEntry = {
  id: string;
  name: string;
  emoji: string;
  mimeType: string;
  localPath: string;
  createdByUserId: number;
  createdAt: number;
  volume?: number; // 0.0–1.0; absent/undefined means 1.0 (full volume)
};

// Subset sent to clients (no localPath)
export type TSoundInfo = Omit<TSoundEntry, 'localPath'>;

export type TListSoundsResponse = {
  sounds: TSoundInfo[];
};

export type TUploadSoundPayload = {
  name: string;
  emoji: string;
  fileData: string; // base64-encoded audio file contents
  mimeType: string;
  id?: string;
  volume?: number; // 0.0–1.0; absent means 1.0
  trimStart?: number; // seconds; server-side ffmpeg trim applied after upload
  trimEnd?: number;   // seconds; server-side ffmpeg trim applied after upload
};

export type TGetSoundDataResponse = {
  fileData: string; // base64-encoded audio file contents
  mimeType: string;
};
