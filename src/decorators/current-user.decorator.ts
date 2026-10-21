import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { TokenUser } from "../global.types.js";

export const CurrentUser = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const user: TokenUser = request.user;
        return user;
    }
)