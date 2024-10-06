import getRuntimeEnv from 'src/environments/getRuntimeEnv';
import { ApiError } from './ApiError';

export type ErrorType<ErrorData> = ErrorData;

export type BodyType<BodyData> = BodyData;

type FetcherOptions = {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  params?: // biome-ignore lint/suspicious/noExplicitAny:
  Record<string, string | number | boolean | null | undefined | any> | string[][];
  data?: BodyType<unknown>;
  sent?: boolean;
} & RequestInit;

const baseUrl = getRuntimeEnv().VITE_API_URL;

export const fetcher = async <T>(options: FetcherOptions): Promise<T> => {
  const url = new URL(options.url, baseUrl);
  if (options.params) {
    url.search = new URLSearchParams(
      Object.fromEntries(Object.entries(options.params).filter(([_, p]) => p !== undefined && p !== null && p !== '')),
    ).toString();
  }

  const headers = new Headers({
    'x-api-version': '1.0',
    'content-type': 'application/json;charset=UTF-8',
    ...options.headers,
  });

  const fetchOptions: FetcherOptions = {
    ...options,
    headers,
    body: options.data ? JSON.stringify(options.data) : options.body,
  };

  const res = await fetch(url, fetchOptions);
  const data = await res.json().catch(() => undefined); // response can be empty

  if (!res.ok) {
    throw new ApiError(res.status, data?.message ?? 'Internal Server Error', {
      url: res.url ?? options.url,
    });
  }

  return data;
};
