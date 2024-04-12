import { useEffect, useReducer, useRef } from 'react';
import { type FetchOptions, fetcher } from 'views/DlnBridge/fetchInstance';

interface State<T> {
  data?: T;
  error?: Error;
}

type Cache<T> = { [url: string]: T };

// discriminated union type
type Action<T> = { type: 'loading' } | { type: 'fetched'; payload: T } | { type: 'error'; payload: Error };

export function useFetch<T = unknown>(options?: FetchOptions): State<T> {
  const cache = useRef<Cache<T>>({});

  // Used to prevent state update if the component is unmounted
  const cancelRequest = useRef<boolean>(false);

  const initialState: State<T> = {
    error: undefined,
    data: undefined,
  };

  // Keep state logic separated
  const fetchReducer = (state: State<T>, action: Action<T>): State<T> => {
    switch (action.type) {
      case 'loading':
        return { ...initialState };
      case 'fetched':
        return { ...initialState, data: action.payload };
      case 'error':
        return { ...initialState, error: action.payload };
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(fetchReducer, initialState);

  useEffect(() => {
    // Do nothing if the url is not given
    if (!options?.url) return;

    cancelRequest.current = false;

    const fetchData = async () => {
      dispatch({ type: 'loading' });

      // If a cache exists for this url, return it
      if (cache.current[options.url]) {
        dispatch({ type: 'fetched', payload: cache.current[options.url] });
        return;
      }

      try {
        const opts: FetchOptions = { url: options.url, method: options.method };
        if (options.params) {
          opts.params = options.params;
        }
        const response = await fetcher(opts);
        if (!response.ok) {
          throw new Error(response.statusText);
        }

        const data = (await response.json()) as T;
        cache.current[options.url] = data;
        if (cancelRequest.current) return;

        dispatch({ type: 'fetched', payload: data });
      } catch (error) {
        if (cancelRequest.current) return;

        dispatch({ type: 'error', payload: error as Error });
      }
    };

    void fetchData();

    // Use the cleanup function for avoiding a possibly...
    // ...state update after the component was unmounted
    return () => {
      cancelRequest.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.url]);

  return state;
}
