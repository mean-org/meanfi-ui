const dlnApiBaseUrl = 'https://api.dln.trade';

type ErrorType<ErrorData> = ErrorData;

type BodyType<BodyData> = BodyData;

export interface DlnErrorResponse {
  errorCode: number;
  errorId: string;
  errorMessage: string;
  requestId: string;
}

export class DlnApiError extends Error {
  public status: number;
  public jsonError?: DlnErrorResponse;

  constructor(response: Response, data?: ErrorType<DlnErrorResponse>) {
    super('DlnApiError');
    this.status = response.status;
    this.jsonError = data;

    Object.setPrototypeOf(this, DlnApiError.prototype);
  }
}

export type FetchOptions = {
  url: string;
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: Record<string, any>;
  data?: BodyType<unknown>;
  headers?: Record<string, string>;
  sent?: boolean;
} & Omit<RequestInit, 'headers'>;

export const fetcher = async (options: FetchOptions): Promise<Response> => {
  const controller = new AbortController();
  const url = new URL(options.url, dlnApiBaseUrl);
  if (options.params) {
    url.search = new URLSearchParams(options.params).toString();
  }
  const fetchOptions: RequestInit = {
    signal: controller.signal,
    ...options,
    headers: {
      ...options.headers,
    },
    ...(options.data ? { body: JSON.stringify(options.data) } : {}),
  };

  return fetch(url, fetchOptions);
};

export const fetchInstance = async <T>(options: FetchOptions): Promise<T> => {
  const response = await fetcher(options);
  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    response.json().then((jsonError: DlnErrorResponse) => {
      if (response.status === 500) {
        throw new DlnApiError(response, jsonError);
      }
    });
  }

  return data;
};
