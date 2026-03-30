declare module '@sharkord/plugin-sdk' {
  export enum PluginSlot {
    CONNECT_SCREEN = 'connect_screen',
    HOME_SCREEN = 'home_screen',
    CHAT_ACTIONS = 'chat_actions',
    TOPBAR_RIGHT = 'topbar_right',
    FULL_SCREEN = 'full_screen'
  }

  export type TPluginSlotContext = {
    users?: unknown[];
    selectedChannelId?: number;
    currentVoiceChannelId?: number;
    ownUserId?: number;
    executePluginAction: <TResponse = unknown, TPayload = unknown>(
      actionName: string,
      payload?: TPayload
    ) => Promise<TResponse>;
  };

  export type TPluginComponentsMapBySlotId = Record<string, React.ComponentType<any>[]>;

  export type TInvokerContext = {
    userId: number;
    currentVoiceChannelId?: number;
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
