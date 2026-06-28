import { EventEmitter } from 'node:events';
import type {
  OwnerAgentRunAcceptedFrame,
  OwnerAgentRunCompletedFrame,
  OwnerAgentRunEventFrame,
  OwnerAgentRunFailedFrame,
} from '../../../shared/contracts/ws/types.js';

export type RunStreamFrame =
  | { kind: 'accepted'; frame: OwnerAgentRunAcceptedFrame }
  | { kind: 'event'; frame: OwnerAgentRunEventFrame }
  | { kind: 'completed'; frame: OwnerAgentRunCompletedFrame }
  | { kind: 'failed'; frame: OwnerAgentRunFailedFrame };

export interface RunStreamSubscription {
  unsubscribe: () => void;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const channelFor = (runId: string): string => `run:${runId}`;

export const publishRunFrame = (runId: string, payload: RunStreamFrame): void => {
  emitter.emit(channelFor(runId), payload);
};

export const subscribeRunFrames = (
  runId: string,
  listener: (payload: RunStreamFrame) => void
): RunStreamSubscription => {
  const channel = channelFor(runId);
  emitter.on(channel, listener);
  return {
    unsubscribe: () => emitter.off(channel, listener),
  };
};

export const getRunFrameListenerCount = (runId: string): number => (
  emitter.listenerCount(channelFor(runId))
);
