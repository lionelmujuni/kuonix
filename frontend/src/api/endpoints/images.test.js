import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client.js', () => ({
  apiJson: vi.fn(),
  apiUploadMultipart: vi.fn(),
}));

import { apiJson, apiUploadMultipart } from '../client.js';
import {
  uploadJpeg, uploadRaw, classify, group, getUrls, getCameraFeedback,
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
