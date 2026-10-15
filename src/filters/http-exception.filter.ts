import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger();

    catch(exception: any, host: ArgumentsHost) {
        const ctx = host.switchToHttp()
        const request = ctx.getRequest();
        const response = ctx.getResponse();

        const status = exception.getStatus ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

        const exceptionResponse = exception.getResponse();

        const message = typeof exceptionResponse === 'object' && 'message' in exceptionResponse
            ? (exceptionResponse as any).message
            : (exception.message);

        this.logger.error(`[${request.method}] ${request.url} - Status: ${status} - Error: ${JSON.stringify(message)}`);

        response.status(status).json({
            success: false,
            statusCode: status,
            timeStamp: new Date().toISOString(),
            path: request.url,
            method: request.method,
            error: message
        });
    }
}