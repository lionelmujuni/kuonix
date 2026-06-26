import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../sse.js', () => ({
  postSse: vi.fn(),
}));

import { postSse } from '../sse.js';
import { chat } from './agent.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('agent endpoints', () => {
  it('chat() posts the chat payload and handlers to /agent/chat', () => {
    const handlers = { token: vi.fn(), done: vi.fn() };
    const payload = {
      sessionId: 's1',
      message: 'fix the cast',
      imagePath: '/a.jpg',
      imageFeatures: { medianY: 120 },
      imageIssues: ['ColorCast_Blue'],
    };
    chat(payload, handlers);
    expect(postSse).toHaveBeenCalledWith('/agent/chat', payload, handlers);
  });

  it('chat() returns whatever postSse returns (e.g. an abort handle)', () => {
    const handle = { abort: vi.fn() };
    postSse.mockReturnValue(handle);
    expect(chat({ sessionId: 's', message: 'hi' }, {})).toBe(handle);
  });
});
