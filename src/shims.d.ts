declare module '@sharkord/plugin-sdk' {
  export enum PluginSlot {
    CONNECT_SCREEN = 'connect_screen',
    HOME_SCREEN = 'home_screen',
    CHAT_ACTIONS = 'chat_actions',
    TOPBAR_RIGHT = 'topbar_right'
  }

  export type TPluginSlotContext = {
    users?: unknown[];
    selectedChannelId?: number;
    currentVoiceChannelId?: number;
    sendMessage?: (channelId: number, content: string) => void;
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

  export type PluginContext = {
    path: string;
    log: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
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
        executes: (ctx: TInvokerContext, args: any) => Promise<unknown> | unknown;
      }) => void;
    };
    actions: {
      voice: {
        getRouter: (channelId: number) => {
          createPlainTransport: (options: unknown) => Promise<PlainTransport>;
        };
        getListenInfo: () => { announcedAddress?: string; ip: string };
        createStream: (opts: {
          channelId: number;
          title: string;
          key: string;
          producers: { audio?: Producer };
        }) => { remove: () => void };
      };
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
