import type { TPluginComponentsMapBySlotId } from '@sharkord/plugin-sdk';
import { SoundboardLauncher } from './components/soundboard-launcher';

const components: TPluginComponentsMapBySlotId = {
  topbar_right: [SoundboardLauncher],
  chat_actions: [SoundboardLauncher]
};

export { components };
