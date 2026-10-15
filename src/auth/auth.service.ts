import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto.js';
import { TokenUser } from '../globel.types.js';

@Injectable()
export class AuthService {

    constructor(
        private readonly prismaService: PrismaService,
        private readonly configService: ConfigService,
        private readonly jwtService: JwtService,
    ) { }

    async register(registerDto: RegisterDto) {
        const { email, password, name } = registerDto;

        const existingUser = await this.prismaService.user.findUnique({
            where: { email },
            select: {
                role: true
            }
        });

        if (existingUser) {
            throw new ConflictException("User with this email already registered.")
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await this.prismaService.user.create({
            data: {
                email,
                name,
                password: hashedPassword,
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
            }
        });

        return {
            message: "User Registered successfully",
            user,
        }
    }

    async login(loginDto: LoginDto) {
        const { email, password } = loginDto;

        const user = await this.prismaService.user.findUnique({
            where: {
                email
            },
            select: {
                id: true,
                password: true,
                name: true,
                role: true,
            }
        });

        if (!user) {
            throw new UnauthorizedException("Invalid Email or password");
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            throw new UnauthorizedException("Invalid Email or password");
        }

        const [refreshToken, accessToken] = await Promise.all([
            this.generateToken(user.id, email, user.role),
            this.generateToken(user.id, email, user.role, "ACCESS")
        ]);

        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

        await this.prismaService.user.update({
            where: { id: user.id },
            data: {
                hashedRefreshToken
            }
        });

        return {
            user: {
                id: user.id,
                name: user.name,
                role: user.role
            },
            refreshToken,
            accessToken,
        }
    }

    async refresh(refreshToken: string) {

        if (!refreshToken) {
            throw new UnauthorizedException("Refresh token is required");
        }
        const payload: TokenUser = await this.TokenToUser(refreshToken);

        if (!payload) {
            throw new UnauthorizedException("Invalid or expired token");
        }

        const user = await this.prismaService.user.findUnique({
            where: { id: payload.id },
            select: {
                hashedRefreshToken: true,
            },
        });

        if (!user || !user.hashedRefreshToken) {
            throw new UnauthorizedException("Access Denied: Session revoked");
        }

        const isMatch = await bcrypt.compare(refreshToken, user.hashedRefreshToken);

        if (!isMatch) {
            throw new UnauthorizedException("Access Denied: Invalid refresh token");
        }

        const newAccessToken = await this.generateToken(payload.id, payload.email, payload.role, 'ACCESS');

        return {
            newAccessToken
        }
    }

    async logout(id: string) {
        const isLogged = await this.prismaService.user.findUnique({
            where: { id },
            select: { hashedRefreshToken: true }
        });

        if (!isLogged || !isLogged?.hashedRefreshToken) {
            throw new ConflictException("User already logged out.")
        }

        await this.prismaService.user.update({
            where: { id },
            data: {
                hashedRefreshToken: null
            },
            select: {
                id: true
            }
        });

        return {
            message: "Successfully logged out."
        }
    }

    async TokenToUser(token: string, tokenType: 'REFRESH' | 'ACCESS' = "REFRESH") {
        try {
            const payload: TokenUser = await this.jwtService.verifyAsync(token, {
                secret: this.configService.get<string>(`JWT_${tokenType}_SECRET`),
            });

            return payload;
        }
        catch {
            throw new UnauthorizedException("Missing or invalid token")
        }
    }

    async generateToken(id: string, email: string, role: string, tokenType: "REFRESH" | "ACCESS" = "REFRESH") {
        return this.jwtService.signAsync({ id, email, role }, {
            secret: this.configService.get<string>(`JWT_${tokenType}_SECRET`),
            expiresIn: tokenType === 'REFRESH' ? '7d' : '15m',
        } as JwtSignOptions);
    }


}
