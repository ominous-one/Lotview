jest.mock('puppeteer', () => ({
  __esModule: true,
  default: {
    executablePath: jest.fn(() => 'C:\\bundled\\chrome.exe'),
  },
}));

import { resolveLocalChromiumExecutablePath } from '../browserless-unified';

describe('browserless-unified local chromium resolution', () => {
  test('prefers bundled puppeteer chromium when it exists on Windows', () => {
    const resolved = resolveLocalChromiumExecutablePath({
      platform: 'win32',
      pathExists: (candidate) => candidate === 'C:\\bundled\\chrome.exe',
      exec: () => {
        throw new Error('not found');
      },
    });

    expect(resolved).toBe('C:\\bundled\\chrome.exe');
  });

  test('falls back to discovered Windows browser paths when bundled chromium is absent', () => {
    const resolved = resolveLocalChromiumExecutablePath({
      platform: 'win32',
      bundledExecutablePath: '',
      pathExists: (candidate) => candidate === 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      exec: () => '',
    });

    expect(resolved).toBe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  });
});
