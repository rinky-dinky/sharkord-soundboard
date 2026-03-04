import { PluginSlot, type TPluginComponentsMapBySlotId } from '@sharkord/plugin-sdk';
import { SoundboardLauncher } from './components/soundboard-launcher';

const components: TPluginComponentsMapBySlotId = {
  [PluginSlot.TOPBAR_RIGHT]: [SoundboardLauncher]
};

export { components };
