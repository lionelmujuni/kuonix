import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client.js', () => ({
  apiJson: vi.fn(),
}));

import { apiJson } from '../client.js';
import {
  getOllama, saveOllama, listModels, getModules, saveModules,
} from './settings.js';

beforeEach(() => {
  apiJson.mockReset();
});

describe('settings endpoints', () => {
  it('getOllama() GETs /settings/ollama', () => {
    apiJson.mockResolvedValue({ apiKey: '' });
    getOllama();
    expect(apiJson).toHaveBeenCalledWith('/settings/ollama');
  });

  it('saveOllama() POSTs JSON-stringified settings', () => {
    apiJson.mockResolvedValue({});
    const settings = { apiKey: 'sk-123', model: 'qwen' };
    saveOllama(settings);
    expect(apiJson).toHaveBeenCalledWith('/settings/ollama', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  });

  it('listModels() GETs /settings/ollama/models', () => {
    apiJson.mockResolvedValue([{ id: 'qwen' }]);
    listModels();
    expect(apiJson).toHaveBeenCalledWith('/settings/ollama/models');
  });

  it('getModules() GETs /settings/modules', () => {
    apiJson.mockResolvedValue({ modules: {}, firstRun: true });
    getModules();
    expect(apiJson).toHaveBeenCalledWith('/settings/modules');
  });

  it('saveModules() POSTs JSON-stringified modules', () => {
    apiJson.mockResolvedValue({});
    const modules = { ai: true, batch: false };
    saveModules(modules);
    expect(apiJson).toHaveBeenCalledWith('/settings/modules', {
      method: 'POST',
      body: JSON.stringify(modules),
    });
  });

  it('forwards the apiJson resolved value to the caller', async () => {
    apiJson.mockResolvedValue({ firstRun: false });
    await expect(getModules()).resolves.toEqual({ firstRun: false });
  });
});
