import { describe, it, expect } from 'vitest';
import { createImageStage } from './stage.js';

const SRC = 'data:image/jpeg;base64,AAAA';

function layers(stage) {
  return [
    stage.el.querySelector('.image-stage__img--a'),
    stage.el.querySelector('.image-stage__img--b'),
  ];
}

describe('createImageStage', () => {
  it('renders two crossfade layers and a placeholder', () => {
    const stage = createImageStage();
    expect(stage.el.className).toBe('image-stage');
    expect(layers(stage).filter(Boolean)).toHaveLength(2);
    expect(stage.el.querySelector('.image-stage__placeholder').textContent).toBe('Loading…');
  });

  it('setImage() returns undefined for a falsy src (no work to do)', () => {
    const stage = createImageStage();
    expect(stage.setImage('')).toBeUndefined();
  });

  it('setImage() resolves and hides the placeholder once the layer loads', async () => {
    const stage = createImageStage();
    const placeholder = stage.el.querySelector('.image-stage__placeholder');
    const [, layerB] = layers(stage); // active=0 → next is layer B

    const done = stage.setImage(SRC);
    expect(layerB.src).toContain('AAAA');
    layerB.dispatchEvent(new Event('load'));
    await done;

    expect(placeholder.style.display).toBe('none');
  });

  it('setImage() surfaces a load error in the placeholder', async () => {
    const stage = createImageStage();
    const placeholder = stage.el.querySelector('.image-stage__placeholder');
    const [, layerB] = layers(stage);

    const done = stage.setImage(SRC);
    layerB.dispatchEvent(new Event('error'));
    await done;

    expect(placeholder.textContent).toContain('Couldn');
    expect(placeholder.style.display).toBe('');
  });

  it('alternates the active layer across successive loads', async () => {
    const stage = createImageStage();
    const [layerA, layerB] = layers(stage);

    const first = stage.setImage(SRC);          // targets B
    layerB.dispatchEvent(new Event('load'));
    await first;

    const second = stage.setImage('data:image/jpeg;base64,BBBB'); // now targets A
    expect(layerA.src).toContain('BBBB');
    layerA.dispatchEvent(new Event('load'));
    await second;
  });

  it('setPlaceholder() updates text and shows the placeholder', () => {
    const stage = createImageStage();
    stage.setPlaceholder('Decoding RAW…');
    const placeholder = stage.el.querySelector('.image-stage__placeholder');
    expect(placeholder.textContent).toBe('Decoding RAW…');
    expect(placeholder.style.display).toBe('');
  });

  it('clear() strips layer sources and resets the placeholder', () => {
    const stage = createImageStage();
    const [layerA, layerB] = layers(stage);
    layerA.src = SRC;
    stage.clear();
    expect(layerA.getAttribute('src')).toBeNull();
    expect(layerB.getAttribute('src')).toBeNull();
    expect(stage.el.querySelector('.image-stage__placeholder').textContent).toBe('Loading…');
  });
});
