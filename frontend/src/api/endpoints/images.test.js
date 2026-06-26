import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client.js', () => ({
  apiJson: vi.fn(),
  apiUploadMultipart: vi.fn(),
}));
vi.mock('../sse.js', () => ({
  postSse: vi.fn(),
  eventSourceSse: vi.fn(),
}));

import { apiJson, apiUploadMultipart } from '../client.js';
import { postSse, eventSourceSse } from '../sse.js';
import {
  uploadJpeg, uploadRaw, decodeStream, classify, classifyStream,
  group, getUrls, getCameraFeedback,
} from './images.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('images upload endpoints', () => {
  it('uploadJpeg() multipart-uploads under field "files" to /images/upload', () => {
    const files = [new File(['a'], 'a.jpg')];
    uploadJpeg(files);
    expect(apiUploadMultipart).toHaveBeenCalledWith('/images/upload', files, 'files');
  });

  it('uploadRaw() multipart-uploads to /images/upload-raw', () => {
    const files = [new File(['a'], 'a.cr2')];
    uploadRaw(files);
    expect(apiUploadMultipart).toHaveBeenCalledWith('/images/upload-raw', files, 'files');
  });
});

describe('images streaming endpoints', () => {
  it('decodeStream() builds an encoded taskIds query string', () => {
    const handlers = { onMessage: vi.fn() };
    decodeStream(['id 1', 'id/2'], handlers);
    const [url, passedHandlers] = eventSourceSse.mock.calls[0];
    expect(url).toBe(`/images/decode-stream?taskIds=${encodeURIComponent('id 1')}&taskIds=${encodeURIComponent('id/2')}`);
    expect(passedHandlers).toBe(handlers);
  });

  it('classifyStream() posts paths + enableSkin default true', () => {
    const handlers = {};
    classifyStream(['/a.jpg'], handlers);
    expect(postSse).toHaveBeenCalledWith('/images/classify-stream', { paths: ['/a.jpg'], enableSkin: true }, handlers);
  });

  it('classifyStream() honours an explicit enableSkin false', () => {
    classifyStream(['/a.jpg'], {}, { enableSkin: false });
    expect(postSse).toHaveBeenCalledWith('/images/classify-stream', { paths: ['/a.jpg'], enableSkin: false }, {});
  });
});

describe('images JSON endpoints', () => {
  it('classify() POSTs paths with enableSkin default true', () => {
    apiJson.mockResolvedValue({});
    classify(['/a.jpg']);
    expect(apiJson).toHaveBeenCalledWith('/images/classify', {
      method: 'POST',
      body: JSON.stringify({ paths: ['/a.jpg'], enableSkin: true }),
    });
  });

  it('classify() honours enableSkin false', () => {
    apiJson.mockResolvedValue({});
    classify(['/a.jpg'], { enableSkin: false });
    expect(apiJson).toHaveBeenCalledWith('/images/classify', {
      method: 'POST',
      body: JSON.stringify({ paths: ['/a.jpg'], enableSkin: false }),
    });
  });

  it('group() POSTs all grouping params with copy/enableSkin defaults', () => {
    apiJson.mockResolvedValue({});
    group({ paths: ['/a.jpg'], outputRoot: '/out', filterIssue: 'Hazy' });
    expect(apiJson).toHaveBeenCalledWith('/images/group', {
      method: 'POST',
      body: JSON.stringify({
        paths: ['/a.jpg'], outputRoot: '/out', copy: true, enableSkin: true, filterIssue: 'Hazy',
      }),
    });
  });

  it('group() forwards explicit copy=false / enableSkin=false', () => {
    apiJson.mockResolvedValue({});
    group({ paths: [], outputRoot: '/out', copy: false, enableSkin: false });
    expect(apiJson).toHaveBeenCalledWith('/images/group', {
      method: 'POST',
      body: JSON.stringify({
        paths: [], outputRoot: '/out', copy: false, enableSkin: false, filterIssue: undefined,
      }),
    });
  });

  it('getUrls() POSTs paths to /images/get-urls', () => {
    apiJson.mockResolvedValue({});
    getUrls(['/a.jpg', '/b.jpg']);
    expect(apiJson).toHaveBeenCalledWith('/images/get-urls', {
      method: 'POST',
      body: JSON.stringify({ paths: ['/a.jpg', '/b.jpg'] }),
    });
  });

  it('getCameraFeedback() POSTs paths with enableSkin default false', () => {
    apiJson.mockResolvedValue({});
    getCameraFeedback(['/a.jpg']);
    expect(apiJson).toHaveBeenCalledWith('/images/camera-feedback', {
      method: 'POST',
      body: JSON.stringify({ paths: ['/a.jpg'], enableSkin: false }),
    });
  });

  it('getCameraFeedback() honours enableSkin true', () => {
    apiJson.mockResolvedValue({});
    getCameraFeedback(['/a.jpg'], { enableSkin: true });
    expect(apiJson).toHaveBeenCalledWith('/images/camera-feedback', {
      method: 'POST',
      body: JSON.stringify({ paths: ['/a.jpg'], enableSkin: true }),
    });
  });
});
