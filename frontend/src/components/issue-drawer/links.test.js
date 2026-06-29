import { describe, it, expect } from 'vitest';
import {
  partitionResources, searchQueryFromResources, googleUrl, youtubeUrl,
} from './links.js';

const ARTICLE = { label: 'Guide', url: 'https://en.wikipedia.org/wiki/Image_noise', type: 'article' };
const GOOGLE  = { label: 'Search Google',  url: 'https://www.google.com/search?q=Canon+EOS+R5+reduce+noise', type: 'search' };
const YT      = { label: 'Search YouTube', url: 'https://www.youtube.com/results?search_query=Canon+EOS+R5+reduce+noise', type: 'search' };

describe('partitionResources', () => {
  it('splits curated links from search links', () => {
    const { curated, search } = partitionResources([ARTICLE, GOOGLE, YT]);
    expect(curated).toEqual([ARTICLE]);
    expect(search).toEqual([GOOGLE, YT]);
  });

  it('tolerates null/undefined and entries without urls', () => {
    expect(partitionResources(null)).toEqual({ curated: [], search: [] });
    expect(partitionResources([{ type: 'article' }, ARTICLE]).curated).toEqual([ARTICLE]);
  });
});

describe('searchQueryFromResources', () => {
  it('decodes the query from a Google search link', () => {
    expect(searchQueryFromResources([ARTICLE, GOOGLE])).toBe('Canon EOS R5 reduce noise');
  });

  it('falls back to the YouTube search_query param', () => {
    expect(searchQueryFromResources([YT])).toBe('Canon EOS R5 reduce noise');
  });

  it('returns empty string when there is no search link', () => {
    expect(searchQueryFromResources([ARTICLE])).toBe('');
    expect(searchQueryFromResources([])).toBe('');
  });
});

describe('googleUrl / youtubeUrl', () => {
  it('builds encoded search URLs from an edited query', () => {
    expect(googleUrl('white balance grey card')).toBe(
      'https://www.google.com/search?q=white%20balance%20grey%20card');
    expect(youtubeUrl('white balance grey card')).toBe(
      'https://www.youtube.com/results?search_query=white%20balance%20grey%20card');
  });

  it('handles empty input', () => {
    expect(googleUrl('')).toBe('https://www.google.com/search?q=');
    expect(youtubeUrl(undefined)).toBe('https://www.youtube.com/results?search_query=');
  });
});
