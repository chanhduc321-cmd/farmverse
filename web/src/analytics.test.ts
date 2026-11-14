import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createAnalytics } from './analytics.ts';

interface FakeScript { async: boolean; src: string }

let appended: FakeScript[];
let fakeWindow: { dataLayer?: unknown[]; location: { search: string } };

function queued(): unknown[][] {
  return (fakeWindow.dataLayer ?? []).map(entry => Array.from(entry as ArrayLike<unknown>));
}

beforeEach(() => {
  appended = [];
  fakeWindow = { location: { search: '' } };
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', {
    createElement: (): FakeScript => ({ async: false, src: '' }),
    head: { append: (script: FakeScript) => appended.push(script) },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('createAnalytics', () => {
  test.each([undefined, '', 'UA-12345-1', 'G-abc"><script>', 'not-an-id'])(
    'stays inert when the measurement ID is %j',
    id => {
      const analytics = createAnalytics(id);

      analytics.init();
      analytics.track('game_boot');

      expect(analytics.enabled).toBe(false);
      expect(appended).toEqual([]);
      expect(fakeWindow.dataLayer).toBeUndefined();
    },
  );

  test('loads gtag.js asynchronously and configures the property', () => {
    const analytics = createAnalytics('G-TEST12345');

    analytics.init();

    expect(appended).toEqual([{ async: true, src: 'https://www.googletagmanager.com/gtag/js?id=G-TEST12345' }]);
    expect(queued()[0][0]).toBe('js');
    expect(queued()[1]).toEqual(['config', 'G-TEST12345', {}]);
  });

  test('turns on debug mode when the URL asks for it', () => {
    fakeWindow.location.search = '?ga_debug=1';

    createAnalytics('G-TEST12345').init();

    expect(queued()[1]).toEqual(['config', 'G-TEST12345', { debug_mode: true }]);
  });

  test('initialises only once', () => {
    const analytics = createAnalytics('G-TEST12345');

    analytics.init();
    analytics.init();

    expect(appended).toHaveLength(1);
  });

  test('queues events with their params after init', () => {
    const analytics = createAnalytics('G-TEST12345');
    analytics.init();

    analytics.track('farm_plant', { crop_id: 2 });

    expect(queued().at(-1)).toEqual(['event', 'farm_plant', { crop_id: 2 }]);
  });

  test('drops events sent before init', () => {
    const analytics = createAnalytics('G-TEST12345');

    analytics.track('farm_plant');

    expect(fakeWindow.dataLayer).toBeUndefined();
  });

  test('never throws when the page blocks script injection', () => {
    vi.stubGlobal('document', { createElement: () => { throw new Error('blocked'); } });
    const analytics = createAnalytics('G-TEST12345');

    expect(() => analytics.init()).not.toThrow();
    expect(() => analytics.track('game_boot')).not.toThrow();
  });
});
