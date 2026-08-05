import WebSocket, { type RawData } from 'ws';
import { validateFrame } from '../../../../shared/contracts/ws/protocol.js';
import { validateOutboundFrame } from '../../../../shared/contracts/ws/outbound.js';
import type {
  HostRegisterFrame,
  OwnerAgentRunAcceptedFrame,
  OwnerAgentRunCancelFrame,
  OwnerAgentRunCompletedFrame,
  OwnerAgentRunEventFrame,
  OwnerAgentRunFailedFrame,
  OwnerAgentRunPayloadBase,
  OwnerAgentRunRequestFrame,
  OwnerAgentWsProvider,
} from '../../../../shared/contracts/ws/types.js';

export type HostToGatewayFrame =
  | HostRegisterFrame
  | OwnerAgentRunAcceptedFrame
  | OwnerAgentRunEventFrame
  | OwnerAgentRunCompletedFrame
  | OwnerAgentRunFailedFrame;

export type GatewayToHostFrame = OwnerAgentRunRequestFrame | OwnerAgentRunCancelFrame;

export type MockHostMode = 'online' | 'offline' | 'cancel' | 'reset' | 'seq-gap' | 'backpressure';

export interface MockHostOptions {
  mode?: MockHostMode;
  hostId?: string;
  displayName?: string;
  provider?: OwnerAgentWsProvider;
  providerVersion?: string | null;
  eventCount?: number;
  eventContents?: string[];
  seqGapAfter?: number;
  backpressureLimit?: number;
  now?: () => string;
}

export interface FrameRoundTrip<T> {
  parsed: T;
  serialized: string;
  reparsed: T;
}

const DEFAULT_TIMESTAMP = '2026-04-27T00:00:00.000Z';
const DEFAULT_HOST_ID = '44444444-4444-4444-8444-444444444444';
const DEFAULT_RUN_ID = '11111111-1111-4111-8111-111111111111';
const DEFAULT_CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const DEFAULT_AGENT_ID = '33333333-3333-4333-8333-333333333333';
const DEFAULT_OWNER_MESSAGE_ID = '55555555-5555-4555-8555-555555555555';
const DEFAULT_PROVIDER: OwnerAgentWsProvider = 'claude';
const DEFAULT_EVENT_CONTENTS = [
  'Reading context.',
  'Planning changes.',
  'Applying patch.',
  'Running checks.',
  'Done.',
];

const assertInboundFrame = <T>(frame: T): T => {
  const result = validateFrame(frame);

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data as T;
};

const assertOutboundFrame = <T>(frame: T): T => {
  const result = validateOutboundFrame(frame);

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data as T;
};

export const validateHostToGatewayRoundTrip = <T extends HostToGatewayFrame>(
  frame: T
): FrameRoundTrip<T> => {
  const parsed = assertInboundFrame(frame);
  const serialized = JSON.stringify(parsed);
  const reparsed = assertInboundFrame(JSON.parse(serialized));

  return { parsed, serialized, reparsed };
};

export const validateGatewayToHostRoundTrip = <T extends GatewayToHostFrame>(
  frame: T
): FrameRoundTrip<T> => {
  const parsed = assertOutboundFrame(frame);
  const serialized = JSON.stringify(parsed);
  const reparsed = assertOutboundFrame(JSON.parse(serialized));

  return { parsed, serialized, reparsed };
};

export const createOwnerAgentRunRequestFixture = (
  overrides: Partial<OwnerAgentRunRequestFrame> = {}
): OwnerAgentRunRequestFrame => ({
  type: 'owner_agent_run_request',
  id: 'run-request-1',
  timestamp: DEFAULT_TIMESTAMP,
  payload: {
    run_id: DEFAULT_RUN_ID,
    conversation_id: DEFAULT_CONVERSATION_ID,
    agent_id: DEFAULT_AGENT_ID,
    provider: DEFAULT_PROVIDER,
    correlation_id: 'corr-1',
    owner_message_id: DEFAULT_OWNER_MESSAGE_ID,
    content: 'Review this repository.',
    content_type: 'text',
    instructions: 'Be concise.',
    requested_model: 'gpt-5.5-high',
    provider_session_id: null,
    provider_work_dir: null,
  },
  ...overrides,
});

export class MockOwnerAgentHost {
  readonly sentFrames: HostToGatewayFrame[] = [];
  readonly receivedRunRequests: OwnerAgentRunRequestFrame[] = [];
  readonly cancelledRunIds = new Set<string>();
  readonly resetConversationIds = new Set<string>();

  private readonly options: Required<Omit<MockHostOptions, 'eventContents' | 'providerVersion'>> & {
    eventContents: string[];
    providerVersion: string | null;
  };

  private socket: WebSocket | null = null;

  constructor(options: MockHostOptions = {}) {
    this.options = {
      mode: options.mode ?? 'online',
      hostId: options.hostId ?? DEFAULT_HOST_ID,
      displayName: options.displayName ?? 'QRClaw Mock Host',
      provider: options.provider ?? DEFAULT_PROVIDER,
      providerVersion: options.providerVersion ?? '1.0.0',
      eventCount: options.eventCount ?? DEFAULT_EVENT_CONTENTS.length,
      eventContents: options.eventContents ?? DEFAULT_EVENT_CONTENTS,
      seqGapAfter: options.seqGapAfter ?? 0,
      backpressureLimit: options.backpressureLimit ?? Number.POSITIVE_INFINITY,
      now: options.now ?? (() => DEFAULT_TIMESTAMP),
    };
  }

  get isOffline(): boolean {
    return this.options.mode === 'offline';
  }

  createRegisterFrame(): HostRegisterFrame {
    return {
      type: 'host_register',
      id: 'host-register-1',
      timestamp: this.options.now(),
      payload: {
        host_id: this.options.hostId,
        host_type: 'local',
        display_name: this.options.displayName,
        providers: [
          {
            provider: this.options.provider,
            version: this.options.providerVersion,
            status: this.isOffline ? 'unavailable' : 'available',
            capabilities: {
              streaming: true,
              full_access: true,
              models: ['gpt-5.5-high'],
            },
          },
        ],
      },
    };
  }

  handleGatewayFrame(frame: GatewayToHostFrame): HostToGatewayFrame[] {
    if (frame.type === 'owner_agent_run_cancel') {
      this.cancelledRunIds.add(frame.payload.run_id);
      return [];
    }

    return this.handleRunRequest(frame);
  }

  recordSessionReset(conversationId: string): void {
    this.resetConversationIds.add(conversationId);
  }

  handleRunRequest(request: OwnerAgentRunRequestFrame): HostToGatewayFrame[] {
    this.receivedRunRequests.push(request);

    if (this.isOffline) {
      return [];
    }

    const accepted = this.createAcceptedFrame(request);

    if (
      this.options.mode === 'backpressure' &&
      this.options.eventCount > this.options.backpressureLimit
    ) {
      return [
        accepted,
        this.createFailedFrame(request, {
          seq: 1,
          errorCode: 'backpressure',
          errorMessage: 'Mock Host hit configured backpressure limit.',
        }),
      ];
    }

    const events = this.createEventFrames(request);
    const lastEventSeq = events.at(-1)?.payload.seq ?? 0;

    return [accepted, ...events, this.createCompletedFrame(request, lastEventSeq + 1)];
  }

  async connect(gatewayWsUrl: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(gatewayWsUrl);
      this.socket = socket;

      socket.once('open', () => {
        this.sendFrame(this.createRegisterFrame());
        resolve();
      });
      socket.once('error', reject);
      socket.on('message', (data) => this.handleSocketMessage(data));
    });
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }

  private createAcceptedFrame(request: OwnerAgentRunRequestFrame): OwnerAgentRunAcceptedFrame {
    return {
      type: 'owner_agent_run_accepted',
      id: `accepted-${request.payload.run_id}`,
      timestamp: this.options.now(),
      payload: {
        ...this.baseRunPayload(request),
        host_id: this.options.hostId,
        accepted_at: this.options.now(),
      },
    };
  }

  private createEventFrames(request: OwnerAgentRunRequestFrame): OwnerAgentRunEventFrame[] {
    return Array.from({ length: this.options.eventCount }, (_, index) => {
      const naturalSeq = index + 1;
      const seq =
        this.options.mode === 'seq-gap' && naturalSeq > this.options.seqGapAfter
          ? naturalSeq + 1
          : naturalSeq;

      return {
        type: 'owner_agent_run_event',
        id: `event-${request.payload.run_id}-${seq}`,
        timestamp: this.options.now(),
        payload: {
          ...this.baseRunPayload(request),
          seq,
          event_type: 'text',
          content: this.options.eventContents[index] ?? `Mock event ${naturalSeq}`,
        },
      };
    });
  }

  private createCompletedFrame(
    request: OwnerAgentRunRequestFrame,
    seq: number
  ): OwnerAgentRunCompletedFrame {
    return {
      type: 'owner_agent_run_completed',
      id: `completed-${request.payload.run_id}`,
      timestamp: this.options.now(),
      payload: {
        ...this.baseRunPayload(request),
        seq,
        final_message: 'Mock Host completed the run.',
        actual_model: request.payload.requested_model ?? null,
        provider_session_id: request.payload.provider_session_id ?? null,
        provider_work_dir: request.payload.provider_work_dir ?? null,
      },
    };
  }

  private createFailedFrame(
    request: OwnerAgentRunRequestFrame,
    failure: {
      seq: number;
      errorCode: string;
      errorMessage: string;
    }
  ): OwnerAgentRunFailedFrame {
    return {
      type: 'owner_agent_run_failed',
      id: `failed-${request.payload.run_id}`,
      timestamp: this.options.now(),
      payload: {
        ...this.baseRunPayload(request),
        seq: failure.seq,
        error_code: failure.errorCode,
        error_message: failure.errorMessage,
        retryable: failure.errorCode === 'backpressure',
      },
    };
  }

  private baseRunPayload(request: OwnerAgentRunRequestFrame): OwnerAgentRunPayloadBase {
    return {
      run_id: request.payload.run_id,
      conversation_id: request.payload.conversation_id,
      agent_id: request.payload.agent_id,
      provider: request.payload.provider,
      correlation_id: request.payload.correlation_id,
    };
  }

  private sendFrame(frame: HostToGatewayFrame): void {
    const validFrame = validateHostToGatewayRoundTrip(frame).parsed;
    this.sentFrames.push(validFrame);
    this.socket?.send(JSON.stringify(validFrame));
  }

  private handleSocketMessage(data: RawData): void {
    const frame = JSON.parse(data.toString()) as GatewayToHostFrame;
    const result = validateOutboundFrame(frame);

    if (!result.success) {
      throw new Error(result.error);
    }

    for (const responseFrame of this.handleGatewayFrame(result.data as GatewayToHostFrame)) {
      this.sendFrame(responseFrame);
    }
  }
}
