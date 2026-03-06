export type TSoundEntry = {
  id: string;
  name: string;
  emoji: string;
  mimeType: string;
  sourceUrl?: string;
  dataBase64?: string;
  createdByUserId: number;
  createdAt: number;
};

export type TListSoundsResponse = {
  sounds: TSoundEntry[];
};
