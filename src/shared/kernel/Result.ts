export class Result<T> {
  public isSuccess: boolean;
  public isFailure: boolean;
  private _error?: string;
  private _value?: T;

  private constructor(isSuccess: boolean, error?: string, value?: T) {
    if (isSuccess && error) {
      throw new Error('A successful result cannot have an error');
    }
    if (!isSuccess && !error) {
      throw new Error('A failed result must have an error message');
    }

    this.isSuccess = isSuccess;
    this.isFailure = !isSuccess;
    this._error = error;
    this._value = value;
  }

  get value(): T {
    if (!this.isSuccess) {
      throw new Error('Cannot get value from a failed result');
    }
    return this._value as T;
  }

  get error(): string {
    return this._error || '';
  }

  static ok<U>(value?: U): Result<U> {
    return new Result<U>(true, undefined, value);
  }

  static fail<U>(error: string): Result<U> {
    return new Result<U>(false, error);
  }

  static combine(results: Result<any>[]): Result<any> {
    for (const result of results) {
      if (result.isFailure) return result;
    }
    return Result.ok();
  }
}
