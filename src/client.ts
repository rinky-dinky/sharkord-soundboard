import { PluginSlot, type TPluginComponentsMapBySlotId } from '@sharkord/plugin-sdk';
import { SoundboardPanel } from './components/soundboard-panel';

const components: TPluginComponentsMapBySlotId = {
  [PluginSlot.HOME_SCREEN]: [SoundboardPanel]
};

export { components };
