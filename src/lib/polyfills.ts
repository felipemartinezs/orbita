type PromiseWithResolversResult<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

const PromiseWithResolvers = Promise as typeof Promise & {
  withResolvers?: <T>() => PromiseWithResolversResult<T>;
};

if (typeof PromiseWithResolvers.withResolvers !== 'function') {
  PromiseWithResolvers.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    return { promise, resolve, reject };
  };
}

const UrlWithParse = URL as typeof URL & {
  parse?: (url: string, base?: string) => URL | null;
};

if (typeof UrlWithParse.parse !== 'function') {
  UrlWithParse.parse = (url: string, base?: string) => {
    try {
      return base ? new URL(url, base) : new URL(url);
    } catch {
      return null;
    }
  };
}
