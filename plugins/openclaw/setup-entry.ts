import { defineSetupPluginEntry } from './src/openclaw-types.js';
import { createQRClawChannelPlugin } from './src/channel.js';

export default defineSetupPluginEntry(createQRClawChannelPlugin());
