import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { TokenUser } from "../globel.types.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {

    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const accessToken = request.headers.authorization?.split(" ")[1];

        if (!accessToken) {
            throw new UnauthorizedException("Missing or invalid access token.");
        }

        try {
            const payload: TokenUser = await this.jwtService.verifyAsync(accessToken, {
                secret: this.configService.get<string>("JWT_ACCESS_SECRET"),
            });

            request['user'] = payload;
        }
        catch {
            throw new UnauthorizedException("Invalid or expired token");
        }

        return true;
    }
}