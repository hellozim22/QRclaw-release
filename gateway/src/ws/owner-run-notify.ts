import type { ServerFrame } from '../../../shared/contracts/ws/types.js';
import { getOwnerConnections } from './registry.js';
import { sendFrame } from './send.js';

/** Push owner-agent run updates to connected owner browsers (SSE backup path). */
export const notifyOwnerRunFrame = (ownerId: string, frame: ServerFrame): void => {
  for (const { ws, info } of getOwnerConnections(ownerId)) {
    sendFrame(ws, frame, { connectionId: info.connectionId });
  }
};
