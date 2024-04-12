export type Confirmations = number | 'max';
export type Timestamp = number | 'unavailable';

export enum FetchStatus {
  Iddle = 0,
  Fetching = 1,
  FetchFailed = 2,
  Fetched = 3,
}
