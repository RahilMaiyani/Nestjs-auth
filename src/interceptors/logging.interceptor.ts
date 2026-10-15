import { CallHandler, ExecutionContext, Logger, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";

export class LoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger()

    intercept(context: ExecutionContext, next: CallHandler<any>): Observable<any> | Promise<Observable<any>> {
        const request = context.switchToHttp().getRequest();
        const now = Date.now();
        const { method, path } = request;
        return next.handle().pipe(
            tap(() => {
                this.logger.log(`[LoggingInterceptor] [${method}] - ${path} (+${Date.now() - now}ms)`);
            })
        )
    }
}