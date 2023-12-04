import { dlnApiBaseUrl } from "./api"

export type ErrorType<ErrorData> = ErrorData

export type BodyType<BodyData> = BodyData

export class ApiError extends Error {
  public status: number
  public title?: string
  public detail?: string

  constructor(
    response: Response,
    data?: ErrorType<{ title?: string; detail?: string }>
  ) {
    super('ApiError')
    this.status = response.status
    this.title = data?.title
    this.detail = data?.detail

    Object.setPrototypeOf(this, ApiError.prototype)
  }
}

export type FetchOptions = {
  url: string
  method: 'get' | 'post' | 'put' | 'delete' | 'patch'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: Record<string, any>
  data?: BodyType<unknown>
  headers?: Record<string, string>
  sent?: boolean
} & Omit<RequestInit, 'headers'>

export const fetcher = async (options: FetchOptions): Promise<Response> => {
  const controller = new AbortController()
  const url = new URL(options.url, dlnApiBaseUrl)
  if (options.params) {
    url.search = new URLSearchParams(options.params).toString()
  }
  const fetchOptions: RequestInit = {
    signal: controller.signal,
    ...options,
    headers: {
      ...options.headers
    },
    ...(options.data ? { body: JSON.stringify(options.data) } : {})
  }

  return fetch(url, fetchOptions)
}

export const fetchInstance = async <T>(options: FetchOptions): Promise<T> => {
  const response = await fetcher(options)
  const data = await response.json().catch(() => undefined)

  if (!response.ok) {
    throw new ApiError(response, data)
  }

  return data
}
