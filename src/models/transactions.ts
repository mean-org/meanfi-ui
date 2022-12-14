export type Confirmations = number | 'max';
export type Timestamp = number | 'unavailable';

export enum FetchStatus {
  Iddle,
  Fetching,
  FetchFailed,
  Fetched,
}
