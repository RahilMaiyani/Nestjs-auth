import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcrypt';
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
        const { email, password, name, role } = registerDto;

        const existingUser = await this.prismaService.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            throw new ConflictException("User with this email already registered.")
        }

        const hashedPassword = await hash(password, 10);

        const user = await this.prismaService.user.create({
            data: {
                email,
                name,
                password: hashedPassword,
                role: role ?? 'user',
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

    async generateRefreshToken(id: string, email: string, role: string) {
        return this.jwtService.signAsync({ id, email, role }, {
            secret: this.configService.get<string>("JWT_REFRESH_SECRET"),
            expiresIn: '7d'
        } as JwtSignOptions);
    }

    async generateAccessToken(id: string, email: string, role: string) {
        return await this.jwtService.signAsync({ id, email, role });
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
                role: true,
            }
        });

        if (!user) {
            throw new UnauthorizedException("Invalid Email or password");
        }

        const isMatch = await compare(password, user.password);

        if (!isMatch) {
            throw new UnauthorizedException("Invalid Email or password");
        }

        const refreshToken = (await this.generateRefreshToken(user.id, email, user.role)).toString();
        const accessToken = await this.generateAccessToken(user.id, email, user.role);

        const hashedRefreshToken = await hash(refreshToken, 10);

        await this.prismaService.user.update({
            where: { id: user.id },
            data: {
                hashedRefreshToken
            }
        })

        return {
            user: {
                id: user.id,
                email,
                role: user.role
            },
            refreshToken,
            accessToken,
        }
    }

    async TokenToUser(token: string, tokenType: 'REFRESH' | 'ACCESS' | undefined = "REFRESH") {
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

    async refresh(refreshToken: string) {
        const payload: TokenUser = await this.TokenToUser(refreshToken);

        if (!payload) {
            throw new UnauthorizedException("Invalid or expired token");
        }

        const newAccessToken = await this.generateAccessToken(payload.id, payload.email, payload.role);

        return {
            message: "New Access token generated successfully",
            newAccessToken
        }
    }

}
