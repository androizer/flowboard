import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : undefined;
    const message =
      typeof raw === 'string'
        ? raw
        : raw && typeof raw === 'object' && 'message' in raw
          ? Array.isArray(raw.message)
            ? raw.message.join('; ')
            : String(raw.message)
          : 'An unexpected error occurred.';
    const match = /^(customFields\.[^:]+):\s*(.*)$/.exec(message);
    const code =
      status === 400
        ? 'VALIDATION_ERROR'
        : status === 401
          ? 'UNAUTHENTICATED'
          : status === 403
            ? 'FORBIDDEN'
            : status === 404
              ? 'NOT_FOUND'
              : status === 409
                ? 'CONFLICT'
                : 'INTERNAL_ERROR';
    response.status(status).json({
      error: {
        code,
        message,
        ...(match ? { details: [{ path: match[1], reason: match[2] }] } : {}),
      },
    });
  }
}
