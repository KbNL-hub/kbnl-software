export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 500,
    public details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }

  static unauthorized(msg = 'Unauthorized') {
    return new ApiError('UNAUTHORIZED', msg, 401)
  }

  static forbidden(msg = 'Forbidden') {
    return new ApiError('FORBIDDEN', msg, 403)
  }

  static notFound(msg = 'Not found') {
    return new ApiError('NOT_FOUND', msg, 404)
  }

  static validation(msg: string) {
    return new ApiError('VALIDATION_ERROR', msg, 400)
  }

  static serverError(msg = 'Internal server error') {
    return new ApiError('SERVER_ERROR', msg, 500)
  }

  toJSON() {
    return { error: this.message, code: this.code, status: this.status }
  }
}
