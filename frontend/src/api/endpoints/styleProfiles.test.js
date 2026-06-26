import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client.js', () => ({
  apiJson: vi.fn(),
}));

import { apiJson } from '../client.js';
import {
  listProfiles, createProfile, deleteProfile, indexPortfolio, getStyleGap,
} from './styleProfiles.js';

beforeEach(() => {
  apiJson.mockReset();
});

describe('style-profiles endpoints', () => {
  it('listProfiles() GETs /style-profiles', () => {
    apiJson.mockResolvedValue([]);
    listProfiles();
    expect(apiJson).toHaveBeenCalledWith('/style-profiles');
  });

  it('createProfile() POSTs name + imagePath', () => {
    apiJson.mockResolvedValue({ id: 'p1' });
    createProfile('Warm Portraits', '/imgs/a.jpg');
    expect(apiJson).toHaveBeenCalledWith('/style-profiles', {
      method: 'POST',
      body: JSON.stringify({ name: 'Warm Portraits', imagePath: '/imgs/a.jpg' }),
    });
  });

  it('deleteProfile() DELETEs /style-profiles/:id', () => {
    apiJson.mockResolvedValue(null);
    deleteProfile('p1');
    expect(apiJson).toHaveBeenCalledWith('/style-profiles/p1', { method: 'DELETE' });
  });

  it('indexPortfolio() POSTs the paths array', () => {
    apiJson.mockResolvedValue({ indexed: 12 });
    const paths = ['/a.jpg', '/b.jpg'];
    indexPortfolio(paths);
    expect(apiJson).toHaveBeenCalledWith('/style-profiles/index-portfolio', {
      method: 'POST',
      body: JSON.stringify({ paths }),
    });
  });

  it('getStyleGap() encodes imagePath only when no profileId', () => {
    apiJson.mockResolvedValue({ gap: {} });
    getStyleGap('/photos/my image.jpg');
    expect(apiJson).toHaveBeenCalledWith(
      `/style-profiles/gap?imagePath=${encodeURIComponent('/photos/my image.jpg')}`,
    );
  });

  it('getStyleGap() encodes both imagePath and profileId when provided', () => {
    apiJson.mockResolvedValue({ gap: {} });
    getStyleGap('/photos/a.jpg', 'prof 1');
    expect(apiJson).toHaveBeenCalledWith(
      `/style-profiles/gap?imagePath=${encodeURIComponent('/photos/a.jpg')}&profileId=${encodeURIComponent('prof 1')}`,
    );
  });
});
