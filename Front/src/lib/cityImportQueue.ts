export type CityImportItemStatus = 'queued' | 'importing' | 'imported' | 'skipped_duplicate' | 'failed';

export type CityImportQueueItem = {
  url: string;
  status: CityImportItemStatus;
  profileId?: string;
  error?: string;
};

type CityImportItemResult = {
  status: 'imported' | 'skipped_duplicate';
  profileId?: string;
};

type RunCityImportQueueOptions = {
  urls: string[];
  importItem: (url: string) => Promise<CityImportItemResult>;
  onChange: (items: CityImportQueueItem[]) => void;
  shouldStop: () => boolean;
  random?: () => number;
  wait?: (milliseconds: number, shouldStop: () => boolean) => Promise<void>;
};

export async function runCityImportQueue(options: RunCityImportQueueOptions) {
  const urls = [...new Set(options.urls)].slice(0, 30);
  const items: CityImportQueueItem[] = urls.map((url) => ({ url, status: 'queued' }));
  const notify = () => options.onChange(items.map((item) => ({ ...item })));
  const random = options.random || Math.random;
  const wait = options.wait || waitWithStop;
  notify();

  for (let index = 0; index < items.length; index += 1) {
    if (options.shouldStop()) break;
    items[index] = { url: items[index].url, status: 'importing' };
    notify();
    try {
      const result = await options.importItem(items[index].url);
      items[index] = {
        url: items[index].url,
        status: result.status,
        profileId: result.profileId
      };
    } catch (error) {
      items[index] = {
        url: items[index].url,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Import failed'
      };
    }
    notify();

    if (index < items.length - 1 && !options.shouldStop()) {
      const delay = 3000 + Math.floor(Math.max(0, Math.min(1, random())) * 2001);
      await wait(delay, options.shouldStop);
    }
  }

  return items.map((item) => ({ ...item }));
}

async function waitWithStop(milliseconds: number, shouldStop: () => boolean) {
  const deadline = Date.now() + milliseconds;
  while (!shouldStop() && Date.now() < deadline) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, Math.min(100, Math.max(0, deadline - Date.now()))));
  }
}
