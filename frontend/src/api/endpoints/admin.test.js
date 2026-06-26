import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client.js', () => ({
  apiJson: vi.fn(),
}));

import { apiJson } from '../client.js';
import { cleanupTemp } from './admin.js';

beforeEach(() => {
  apiJson.mockReset();
});

describe('admin endpoints', () => {
  it('cleanupTemp() POSTs an empty JSON body to /admin/cleanup-temp', () => {
    apiJson.mockResolvedValue({ removed: 3 });
    cleanupTemp();
    expect(apiJson).toHaveBeenCalledWith('/admin/cleanup-temp', {
      method: 'POST',
      body: '{}',
    });
  });

  it('forwards the apiJson resolved value to the caller', async () => {
    apiJson.mockResolvedValue({ removed: 3 });
    await expect(cleanupTemp()).resolves.toEqual({ removed: 3 });
  });
});
