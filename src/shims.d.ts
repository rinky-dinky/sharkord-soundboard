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
    MESSAGE_ACTIONS = 'message_actions',
    MESSAGE_FOOTER = 'message_footer',
    MEMBER_LIST_ITEM = 'member_list_item',
    USER_POPOVER = 'user_popover',
    CHANNEL_HEADER = 'channel_header',
    TOPBAR_RIGHT = 'topbar_right',
    FULL_SCREEN = 'full_screen',
    USER_SETTINGS = 'user_settings'
  }

  export type TPluginComponentsMapBySlotId = Record<string, React.ComponentType[]>;

  export type TInvokerContext = {
    userId: number;
    source: 'chat' | 'api';
    channelId?: number;
    parentMessageId?: number;
    messageId?: number;
    currentVoiceChannelId?: number;
    locale: string;
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
    // the host now dispatches by plugin id: a plugin's client code always
    // passes its own manifest id as the first argument
    executePluginAction: <TResponse = unknown, TPayload = unknown>(
      pluginId: string,
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

  export type PluginLoggerMethods = {
    log: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };

  export type PluginContext = {
    /** this plugin's own folder; read-only, wiped and rewritten on every update */
    path: string;
    /** a folder that survives updates and is removed only with the plugin */
    dataPath: string;
    /** the id from manifest.json */
    pluginId: string;
    logger: PluginLoggerMethods;
    /** @deprecated use ctx.logger.log instead */
    log: (...args: unknown[]) => void;
    /** @deprecated use ctx.logger.debug instead */
    debug: (...args: unknown[]) => void;
    /** @deprecated use ctx.logger.error instead */
    error: (...args: unknown[]) => void;
    ui: { enable: () => void; disable: () => void };
    settings: {
      register: <T extends readonly { key: string }[]>(defs: T) => Promise<{
        get: (key: T[number]['key']) => string;
        set: (key: T[number]['key'], value: string) => void;
      }>;
    };
    commands: {
      register: (command: {
        name: string;
        description?: string;
        args?: { name: string; type: 'string' | 'number' | 'boolean'; required?: boolean }[];
        executes: (ctx: TInvokerContext, args: any) => Promise<unknown>;
      }) => void;
    };
    actions: {
      register: (action: {
        name: string;
        description?: string;
        executes: (ctx: TInvokerContext, payload: any) => Promise<unknown>;
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
  };

  /**
   * The context passed to onUnload: everything registration-related is gone
   * since it would only be torn down again a moment later.
   */
  export type UnloadPluginContext = {
    path: string;
    dataPath: string;
    logger: PluginLoggerMethods;
    log: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    voice: PluginContext['voice'];
    ui: PluginContext['ui'];
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
