import { describe, it, expect, vi, beforeEach } from 'vitest';

// bus.js holds module-level handler state. Re-import per test for isolation.
let bus;
beforeEach(async () => {
  vi.resetModules();
  bus = await import('./bus.js');
});

describe('bus', () => {
  it('emits to subscribed handlers', () => {
    const fn = vi.fn();
    bus.on('evt', fn);
    bus.emit('evt', { x: 1 });
    expect(fn).toHaveBeenCalledWith({ x: 1 });
  });

  it('supports multiple handlers per event', () => {
    const a = vi.fn(); const b = vi.fn();
    bus.on('evt', a);
    bus.on('evt', b);
    bus.emit('evt', 'p');
    expect(a).toHaveBeenCalledWith('p');
    expect(b).toHaveBeenCalledWith('p');
  });

  it('returns an unsubscribe function from on()', () => {
    const fn = vi.fn();
    const off = bus.on('evt', fn);
    off();
    bus.emit('evt');
    expect(fn).not.toHaveBeenCalled();
  });

  it('off() removes a specific handler', () => {
    const a = vi.fn(); const b = vi.fn();
    bus.on('evt', a);
    bus.on('evt', b);
    bus.off('evt', a);
    bus.emit('evt');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  it('does nothing when emitting an event with no listeners', () => {
    expect(() => bus.emit('nobody-listening', 1)).not.toThrow();
  });

  it('swallows handler exceptions and keeps invoking the rest', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    bus.on('evt', bad);
    bus.on('evt', good);
    bus.emit('evt', 'x');
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalledWith('x');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('exposes EVENTS constants for stage messages', () => {
    expect(bus.EVENTS.STAGE_SET_IMAGE).toBe('kuonix:stage:set-image');
    expect(bus.EVENTS.STAGE_RIPPLE).toBe('kuonix:stage:ripple');
    expect(bus.EVENTS.STAGE_RESTORE).toBe('kuonix:stage:restore');
  });
});
