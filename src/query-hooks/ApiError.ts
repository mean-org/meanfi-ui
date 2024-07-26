/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  public status: number;
  public options?: {
    url?: string;
    errors?: Record<string, string[]>;
  };

  constructor(statusCode?: number, message?: string, options?: (typeof ApiError)['prototype']['options']) {
    super(message ?? 'API Error');

    this.status = statusCode ?? 500;
    this.options = options;

    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
