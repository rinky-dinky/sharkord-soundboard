// Stored in sounds.json on the server; localPath is server-internal and never sent to clients
export type TSoundEntry = {
  id: string;
  name: string;
  emoji: string;
  mimeType: string;
  localPath: string;
  createdByUserId: number;
  createdAt: number;
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
};
