import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderEmptyState, isRawFile, RAW_EXTENSIONS } from './empty-state.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// jsdom has no DragEvent; fake the minimal shape the handlers touch.
function dragEvent(type, files = []) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  ev.dataTransfer = { files, dropEffect: '' };
  return ev;
}

describe('renderEmptyState — copy by mode', () => {
  it('single mode renders single-image headline + non-multiple input', () => {
    const node = renderEmptyState(() => {});
    expect(node.querySelector('h1').textContent).toContain('Drop an image');
    expect(node.querySelector('input[type=file]').multiple).toBe(false);
  });

  it('batch mode renders set headline + multiple input', () => {
    const node = renderEmptyState(() => {}, { mode: 'batch' });
    expect(node.querySelector('h1').textContent).toContain('Drop a set');
    expect(node.querySelector('input[type=file]').multiple).toBe(true);
  });

  it('exposes a drop-zone with the expected accept extensions', () => {
    const node = renderEmptyState(() => {});
    const accept = node.querySelector('input[type=file]').getAttribute('accept');
    expect(accept).toContain('.cr2');
    expect(accept).toContain('.jpg');
  });
});

describe('renderEmptyState — file selection', () => {
  it('input change forwards the chosen files to onFiles', () => {
    const onFiles = vi.fn();
    const node = renderEmptyState(onFiles);
    const input = node.querySelector('input[type=file]');
    const file = new File(['x'], 'x.jpg');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it('does not call onFiles when the selection is empty', () => {
    const onFiles = vi.fn();
    const node = renderEmptyState(onFiles);
    const input = node.querySelector('input[type=file]');
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('clicking the zone proxies to the hidden file input', () => {
    const node = renderEmptyState(() => {});
    const zone = node.querySelector('.drop-zone');
    const input = node.querySelector('input[type=file]');
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});
    zone.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clickSpy).toHaveBeenCalled();
  });

  it('Enter/Space on the zone opens the file picker', () => {
    const node = renderEmptyState(() => {});
    const zone = node.querySelector('.drop-zone');
    const input = node.querySelector('input[type=file]');
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});
    zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    zone.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });
});

describe('renderEmptyState — drag & drop', () => {
  it('dragenter marks the zone, dragleave clears it', () => {
    const node = renderEmptyState(() => {});
    const zone = node.querySelector('.drop-zone');
    zone.dispatchEvent(dragEvent('dragenter'));
    expect(zone.classList.contains('is-dragover')).toBe(true);
    zone.dispatchEvent(dragEvent('dragleave'));
    expect(zone.classList.contains('is-dragover')).toBe(false);
  });

  it('drop forwards the dropped files and clears the dragover state', () => {
    const onFiles = vi.fn();
    const node = renderEmptyState(onFiles);
    const zone = node.querySelector('.drop-zone');
    const file = new File(['x'], 'photo.jpg');
    zone.dispatchEvent(dragEvent('dragenter'));
    zone.dispatchEvent(dragEvent('drop', [file]));
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(zone.classList.contains('is-dragover')).toBe(false);
  });

  it('dragover sets the copy drop effect', () => {
    const node = renderEmptyState(() => {});
    const zone = node.querySelector('.drop-zone');
    const ev = dragEvent('dragover');
    zone.dispatchEvent(ev);
    expect(ev.dataTransfer.dropEffect).toBe('copy');
  });
});

describe('isRawFile / RAW_EXTENSIONS', () => {
  it('recognises raw extensions case-insensitively', () => {
    expect(isRawFile({ name: 'IMG.CR2' })).toBe(true);
    expect(isRawFile({ name: 'shot.nef' })).toBe(true);
  });

  it('rejects non-raw extensions and extensionless names', () => {
    expect(isRawFile({ name: 'pic.jpg' })).toBe(false);
    expect(isRawFile({ name: 'noext' })).toBe(false);
  });

  it('RAW_EXTENSIONS is a Set covering the common raw formats', () => {
    expect(RAW_EXTENSIONS.has('dng')).toBe(true);
    expect(RAW_EXTENSIONS.has('arw')).toBe(true);
    expect(RAW_EXTENSIONS.has('jpg')).toBe(false);
  });
});
