import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client.js', () => ({
  apiJson: vi.fn(),
}));

import { apiJson } from '../client.js';
import {
  listMethods, listCameraMatrices, preview, commit, apply,
} from './correction.js';

beforeEach(() => {
  apiJson.mockReset();
});

describe('correction endpoints', () => {
  it('listMethods() GETs /color-correct/methods', () => {
    apiJson.mockResolvedValue([{ id: 'gray-world' }]);
    listMethods();
    expect(apiJson).toHaveBeenCalledWith('/color-correct/methods');
  });

  it('listCameraMatrices() GETs /color-correct/camera-matrices', () => {
    apiJson.mockResolvedValue([]);
    listCameraMatrices();
    expect(apiJson).toHaveBeenCalledWith('/color-correct/camera-matrices');
  });

  it('preview() POSTs JSON-stringified body to /preview', () => {
    apiJson.mockResolvedValue({ url: 'blob:p' });
    const req = { taskId: 't1', method: 'gray-world' };
    preview(req);
    expect(apiJson).toHaveBeenCalledWith('/color-correct/preview', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  });

  it('commit() POSTs JSON-stringified body to /commit', () => {
    apiJson.mockResolvedValue({ committedPath: '/p/x.jpg' });
    const req = { taskId: 't1', method: 'temperature_tint', params: { temp: 200 } };
    commit(req);
    expect(apiJson).toHaveBeenCalledWith('/color-correct/commit', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  });

  it('apply() POSTs JSON-stringified body to /apply', () => {
    apiJson.mockResolvedValue({ savedTo: '/out.jpg' });
    const req = { taskId: 't1', destination: '/out.jpg' };
    apply(req);
    expect(apiJson).toHaveBeenCalledWith('/color-correct/apply', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  });

  it('forwards apiJson resolved value to caller', async () => {
    apiJson.mockResolvedValue({ ok: true });
    await expect(preview({ taskId: 't' })).resolves.toEqual({ ok: true });
  });
});
