for (const key of Object.keys(process.env)) {
  if (key.startsWith('MIKI_CODE_')) {
    delete process.env[key];
  }
}

process.env['MIKI_CODE_PERSISTENCE_MINIDB_READMODEL'] = 'false';

const capturedFetch = globalThis.fetch;
const RESERVED_TEST_TLDS = ['.test', '.example', '.invalid', '.localhost'];

try {
  globalThis.fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const raw =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : String(input);
      let host: string;
      try {
        host = new URL(raw).hostname;
      } catch {
        return capturedFetch(input, init);
      }
      if (host !== 'localhost' && RESERVED_TEST_TLDS.some((tld) => host.endsWith(tld))) {
        throw new TypeError(`fetch failed: refusing network access to reserved test host "${host}"`);
      }
      return capturedFetch(input, init);
    },
    { preconnect: capturedFetch.preconnect },
  );
} catch {
  globalThis.fetch = capturedFetch;
}
