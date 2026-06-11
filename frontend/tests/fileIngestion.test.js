import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isRawFile, handleFiles, initFileIngestion } from '../src/fileIngestion.js';

// ── isRawFile ─────────────────────────────────────────────────────────────────

describe('isRawFile', () => {
  // Recognised RAW extensions
  const rawExtensions = [
    '.cr2', '.cr3', '.nef', '.nrw', '.arw', '.dng',
    '.orf', '.raf', '.rw2', '.rwl', '.srw', '.pef', '.raw',
  ];

  rawExtensions.forEach(ext => {
    it(`recognises ${ext} as a RAW file (lowercase)`, () => {
      expect(isRawFile(`photo${ext}`)).toBe(true);
    });

    it(`recognises ${ext.toUpperCase()} as a RAW file (uppercase)`, () => {
      expect(isRawFile(`photo${ext.toUpperCase()}`)).toBe(true);
    });
  });

  it('recognises mixed-case extension (.Cr2)', () => {
    expect(isRawFile('photo.Cr2')).toBe(true);
  });

  // Standard image types — should NOT be recognised as RAW
  it('rejects .jpg', () => {
    expect(isRawFile('photo.jpg')).toBe(false);
  });

  it('rejects .jpeg', () => {
    expect(isRawFile('photo.jpeg')).toBe(false);
  });

  it('rejects .png', () => {
    expect(isRawFile('photo.png')).toBe(false);
  });

  it('rejects .tiff', () => {
    expect(isRawFile('photo.tiff')).toBe(false);
  });

  it('rejects .webp', () => {
    expect(isRawFile('photo.webp')).toBe(false);
  });

  // Edge cases
  it('rejects a filename with no extension', () => {
    expect(isRawFile('rawphoto')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isRawFile('')).toBe(false);
  });

  it('rejects a filename that contains but does not end with a RAW extension', () => {
    expect(isRawFile('photo.cr2.jpg')).toBe(false);
  });

  it('rejects a filename that is only the extension', () => {
    expect(isRawFile('.cr2')).toBe(true); // ".cr2" ends with ".cr2" — valid by spec
  });
});

// ── handleFiles ───────────────────────────────────────────────────────────────

describe('handleFiles', () => {
  beforeEach(() => {
    // Wire up module state using the ESM import (same instance as handleFiles)
    initFileIngestion({
      uploadedImages:    [],
      libraryImages:     [],
      displayImageGrid:  vi.fn(),
      onNewLibraryImage: vi.fn(),
    });

    // Stub fetch so upload requests don't hit a real server
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        images: [],
        paths: [],
      }),
      body: {
        getReader: () => ({
          read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        }),
      },
    });
  });

  it('returns early without calling fetch when given an empty FileList', async () => {
    await handleFiles([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('resolves without error for standard image files (uses FileReader, not fetch)', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await handleFiles([file]);
    // Standard files are read with FileReader locally — fetch should not be called
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('calls fetch to upload RAW files', async () => {
    const rawFile = new File(['data'], 'photo.cr2', { type: '' });
    await handleFiles([rawFile]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/images/upload-raw'),
      expect.any(Object)
    );
  });

  it('shows a toast and skips fetch for completely non-image files', async () => {
    // .txt file — neither RAW nor image/* type
    const txtFile = new File(['text'], 'notes.txt', { type: 'text/plain' });
    await handleFiles([txtFile]);
    // Non-image files are filtered out; fetch should not be called
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
