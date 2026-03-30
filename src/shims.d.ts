import type { TPluginStore } from '@sharkord/plugin-sdk';

declare global {
  interface Window {
    __SHARKORD_STORE__: TPluginStore;
  }
}

declare module '@sharkord/plugin-sdk' {
  export const PLUGIN_SDK_VERSION: number;

  export enum PluginSlot {
    CONNECT_SCREEN = 'connect_screen',
    HOME_SCREEN = 'home_screen',
    CHAT_ACTIONS = 'chat_actions',
    TOPBAR_RIGHT = 'topbar_right',
    FULL_SCREEN = 'full_screen'
  }

  export type TPluginComponentsMapBySlotId = Record<string, React.ComponentType[]>;

  export type TInvokerContext = {
    userId: number;
    currentVoiceChannelId?: number;
  };

  // Mirrors the file fields we need from TFile in @sharkord/shared
  export type TPluginEmojiFile = {
    name: string;
    _accessToken?: string;
    _accessTokenExpiresAt?: number;
  };

  // Mirrors the subset of TJoinedEmoji exposed by the plugin store
  export type TPluginEmoji = {
    id: number;
    name: string;
    file: TPluginEmojiFile;
  };

  export type TPluginStoreState = {
    ownUserId: number | undefined;
    selectedChannelId: number | undefined;
    currentVoiceChannelId: number | undefined;
    emojis: TPluginEmoji[];
  };

  export type TPluginActions = {
    sendMessage: (channelId: number, content: string) => Promise<void>;
    selectChannel: (channelId: number) => void;
    executePluginAction: <TResponse = unknown, TPayload = unknown>(
      actionName: string,
      payload?: TPayload
    ) => Promise<TResponse>;
  };

  export type TPluginStore = {
    getState: () => TPluginStoreState;
    subscribe: (listener: () => void) => () => void;
    actions: TPluginActions;
  };

  export type Producer = {
    close: () => void;
  };

  export type PlainTransport = {
    tuple: { localPort: number };
    close: () => void;
    produce: (options: unknown) => Promise<Producer>;
  };

  export type TExternalStreamHandle = {
    streamId: number;
    remove: () => void;
    update: (options: {
      title?: string;
      avatarUrl?: string;
      producers?: { audio?: Producer; video?: Producer };
    }) => void;
  };

  export type PluginContext = {
    path: string;
    log: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    ui: { enable: () => void; disable: () => void };
    settings: {
      register: <T extends readonly { key: string }[]>(defs: T) => Promise<{
        get: (key: T[number]['key']) => Promise<string>;
        set: (key: T[number]['key'], value: string) => void;
      }>;
    };
    commands: {
      register: (command: {
        name: string;
        description?: string;
        args?: { name: string; type: 'string' | 'number' | 'boolean'; required?: boolean }[];
        execute: (ctx: TInvokerContext, args: any) => Promise<unknown>;
      }) => void;
    };
    actions: {
      register: (action: {
        name: string;
        description?: string;
        execute: (ctx: TInvokerContext, payload: any) => Promise<unknown>;
      }) => void;
    };
    voice: {
      getRouter: (channelId: number) => {
        createPlainTransport: (options: unknown) => Promise<PlainTransport>;
      };
      getListenInfo: () => { announcedAddress?: string; ip: string };
      createStream: (opts: {
        channelId: number;
        title: string;
        key: string;
        avatarUrl?: string;
        producers: { audio?: Producer; video?: Producer };
      }) => TExternalStreamHandle;
    };
    messages: {
      send: (channelId: number, content: string) => Promise<{ messageId: number }>;
      edit: (messageId: number, content: string) => Promise<void>;
      delete: (messageId: number) => Promise<void>;
    };
  };
}

declare module '@sharkord/ui' {
  export const Button: React.ComponentType<any>;
  export const Input: React.ComponentType<any>;
}

declare module 'react-dom' {
  export function createPortal(
    children: React.ReactNode,
    container: Element | DocumentFragment
  ): React.ReactPortal;
}
