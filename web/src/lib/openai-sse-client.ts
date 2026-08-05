export interface OpenAISSEDeltaEvent {
  type: 'delta';
  content: string;
}

export interface OpenAISSEDoneEvent {
  type: 'done';
  finishReason: string | null;
}

export interface OpenAISSEErrorEvent {
  type: 'error';
  message: string;
}

export interface OpenAISSERunIdEvent {
  type: 'run_id';
  runId: string;
}

export type OpenAISSEEvent =
  | OpenAISSEDeltaEvent
  | OpenAISSEDoneEvent
  | OpenAISSEErrorEvent
  | OpenAISSERunIdEvent;

interface OpenAISSEChoice {
  delta?: {
    content?: unknown;
  };
  finish_reason?: unknown;
}

interface OpenAISSEPayload {
  id?: unknown;
  choices?: OpenAISSEChoice[];
  error?: {
    message?: unknown;
  };
}

const parsePayload = (payload: string): OpenAISSEEvent[] => {
  if (payload === '[DONE]') {
    return [{ type: 'done', finishReason: 'stop' }];
  }

  let parsed: OpenAISSEPayload;
  try {
    parsed = JSON.parse(payload) as OpenAISSEPayload;
  } catch {
    return [];
  }

  const errorMessage = parsed.error?.message;
  if (typeof errorMessage === 'string' && errorMessage.length > 0) {
    return [{ type: 'error', message: errorMessage }];
  }

  const choice = parsed.choices?.[0];
  const events: OpenAISSEEvent[] = [];
  if (typeof parsed.id === 'string' && parsed.id.startsWith('chatcmpl_')) {
    const runId = parsed.id.slice('chatcmpl_'.length);
    if (runId.length > 0) {
      events.push({ type: 'run_id', runId });
    }
  }
  const content = choice?.delta?.content;
  if (typeof content === 'string' && content.length > 0) {
    events.push({ type: 'delta', content });
  }

  if (typeof choice?.finish_reason === 'string' && choice.finish_reason.length > 0) {
    if (choice.finish_reason === 'error') {
      events.push({
        type: 'error',
        message:
          typeof content === 'string' && content.length > 0 ? content : 'Agent execution failed',
      });
    } else {
      events.push({ type: 'done', finishReason: choice.finish_reason });
    }
  }

  return events;
};

export async function* parseOpenAISSE(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<OpenAISSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (!signal?.aborted) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

      let boundaryIndex = buffer.indexOf('\n\n');
      while (boundaryIndex !== -1) {
        const rawEvent = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        const dataLines = rawEvent
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim());

        if (dataLines.length > 0) {
          for (const event of parsePayload(dataLines.join('\n'))) {
            yield event;
            if (event.type === 'done' || event.type === 'error') return;
          }
        }

        boundaryIndex = buffer.indexOf('\n\n');
      }
    }
  } catch (error) {
    if (!signal?.aborted) {
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'stream error',
      };
    }
  } finally {
    reader.releaseLock();
  }
}
