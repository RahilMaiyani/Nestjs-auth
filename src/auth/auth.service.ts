import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto.js';
import { TokenUser } from '../global.types.js';
import { toDataURL } from 'qrcode';
import * as crypto from 'crypto';
import { generateSecret, generateURI, verify } from 'otplib';

@Injectable()
export class AuthService {

    constructor(
        private readonly prismaService: PrismaService,
        private readonly configService: ConfigService,
        private readonly jwtService: JwtService,
    ) { }

    async register(registerDto: RegisterDto) {
        const { email, password, name } = registerDto;

        const [existingUser, hashedPassword] = await Promise.all([
            this.prismaService.user.findUnique({
                where: { email },
                select: {
                    role: true
                }
            }),
            bcrypt.hash(password, 10)]);

        if (existingUser) {
            throw new ConflictException("User with this email already registered.")
        }

        const user = await this.prismaService.user.create({
            data: {
                email,
                name,
                password: hashedPassword,
            },
            select: {
                id: true
            }
        });

        return {
            message: "User Registered successfully",
            user: {
                id: user.id,
                email,
                name,
                role: "USER",
            },
        }
    }

    async generatePreAuthToken(id: string, email: string) {
        return this.jwtService.signAsync(
            { id, email, is2FAPending: true },
            {
                secret: this.configService.get<string>("JWT_MFA_SECRET"),
                expiresIn: '5m',
            } as JwtSignOptions
        )
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
                isActive: true,
                isTwoFactorEnabled: true,
            }
        });

        if (!user) {
            throw new UnauthorizedException("Invalid Email or password");
        }

        if (!user.isActive) {
            throw new ConflictException("User is Deactivated.")
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            throw new UnauthorizedException("Invalid Email or password");
        }

        if (user.isTwoFactorEnabled) {
            const preAuthToken = await this.generatePreAuthToken(user.id, email);

            return {
                require2FA: true,
                message: "Two-Factor Authentication code required",
                preAuthToken,
            }
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

    async generate2FA(userId: string, email: string) {
        const user = await this.prismaService.user.findUnique({
            where: { id: userId },
            select: { isTwoFactorEnabled: true },
        });

        if (!user) {
            throw new BadRequestException("userId invalid.");
        }

        if (user.isTwoFactorEnabled) {
            throw new BadRequestException("2FA is already enabled open this account.");
        }

        const secret = generateSecret();

        const appname = this.configService.get<string>("MFA_APP_NAME", "AuthAPI");
        const otpauthUrl = generateURI({
            issuer: appname,
            label: email,
            secret,
        });

        const [qrCodeDataUrl, _] = await Promise.all([
            toDataURL(otpauthUrl),
            this.prismaService.user.update({
                where: { id: userId },
                data: { twoFactorSecret: secret },
            }),
        ]);

        return {
            secret,
            url: otpauthUrl,
            qrCode: qrCodeDataUrl,
            message: "Scan the QR code in Authenticator app like Google Authenticator or Authy, then verify with /auth/2fa/enable",
        }
    }

    async enable2FA(userId: string, code: string) {
        if (!code) {
            throw new BadRequestException("Verification code is required");
        }

        const user = await this.prismaService.user.findUnique({
            where: { id: userId },
            select: {
                twoFactorSecret: true,
                isTwoFactorEnabled: true,
            },
        });

        if (!user || !user.twoFactorSecret) {
            throw new BadRequestException("Please generate 2FA secret first via /auth/2fa/generate")
        }

        if (user.isTwoFactorEnabled) {
            throw new BadRequestException("2FA is already enabled.");
        }

        const result = await verify({
            secret: user.twoFactorSecret,
            token: code,
        });

        if (!result.valid) {
            throw new UnauthorizedException("Invalid 2FA code. Please enter the current code from your authenticator app.");
        }

        const rawRecoveryCodes: string[] = [];
        for (let i = 0; i < 8; i++) {
            const part1 = crypto.randomBytes(2).toString('hex');
            const part2 = crypto.randomBytes(3).toString('hex');
            rawRecoveryCodes.push(`${part1}-${part2}`);
        }

        const hashedCodes = await Promise.all(
            rawRecoveryCodes.map(async (rawCode) => {
                const codeHash = await bcrypt.hash(rawCode, 10);
                return {
                    userId,
                    codeHash,
                }
            })
        );

        await this.prismaService.$transaction([
            this.prismaService.recoveryCode.deleteMany({ where: { userId } }),
            this.prismaService.recoveryCode.createMany({ data: hashedCodes }),
            this.prismaService.user.update({
                where: { id: userId },
                data: { isTwoFactorEnabled: true },
            }),
        ]);

        return {
            message: "2FA successfully enabled! Save your recovery codes in safe place. They will only be show once.",
            recoveryCodes: rawRecoveryCodes,
        }
    }

    async authenticate2FA(preAuthToken: string, code: string) {
        if (!preAuthToken || !code) {
            throw new BadRequestException("preAuthToken and 2FA code are required");
        }

        let payload: { id: string, email: string, is2FAPending?: boolean };
        try {
            payload = await this.jwtService.verifyAsync(preAuthToken, {
                secret: this.configService.get<string>("JWT_MFA_SECRET"),
            });
        }
        catch {
            throw new UnauthorizedException("Invalid or expired 2FA session. Please log in again.");
        }

        const user = await this.prismaService.user.findUnique({
            where: { id: payload.id },
            select: {
                id: true,
                email: true,
                role: true,
                isActive: true,
                isTwoFactorEnabled: true,
                twoFactorSecret: true,
                recoveryCodes: {
                    where: { used: false },
                    select: { id: true, codeHash: true },
                },
            },
        });

        if (!user || !user.isActive || !user.isTwoFactorEnabled || !user.twoFactorSecret) {
            throw new UnauthorizedException("Access Denied: 2FA is not active for this account");
        }

        let isCodeValid = false;
        let burnedRecoveryCodeId: string | null = null;

        if (code.length === 6 && /^\d+$/.test(code)) {
            const result = await verify({
                secret: user.twoFactorSecret,
                token: code,
            });
            isCodeValid = result.valid;
        }

        if (!isCodeValid && user.recoveryCodes.length > 0) {
            for (const rc of user.recoveryCodes) {
                const isMatch = await bcrypt.compare(code, rc.codeHash);
                if (isMatch) {
                    isCodeValid = true;
                    burnedRecoveryCodeId = rc.id;
                    break;
                }
            }
        }

        if (!isCodeValid) {
            throw new UnauthorizedException("Invalid 2FA code or recovery code");
        }

        const [refreshToken, accessToken] = await Promise.all([
            this.generateToken(user.id, user.email, user.role, "REFRESH"),
            this.generateToken(user.id, user.email, user.role, "ACCESS"),
        ]);

        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

        await this.prismaService.$transaction(async (tx) => {
            if (burnedRecoveryCodeId) {
                await tx.recoveryCode.update({
                    where: { id: burnedRecoveryCodeId },
                    data: {
                        used: true,
                        usedAt: new Date(),
                    }
                });
            }

            await tx.user.update({
                where: { id: user.id },
                data: { hashedRefreshToken }
            });
        });

        return {
            message: burnedRecoveryCodeId
                ? "Logged in using recovery code! Note: That recovery code has now been burned."
                : "Two-Factor authentication successfull!",
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
            },
            refreshToken,
            accessToken,
        }
    }

    async disable2FA(userId: string, password: string, code: string) {
        if (!password || !code) {
            throw new BadRequestException("Password and 2FA code are required to disable 2FA");
        }

        const user = await this.prismaService.user.findUnique({
            where: { id: userId },
            select: {
                password: true,
                twoFactorSecret: true,
                isTwoFactorEnabled: true,
            }
        });

        if (!user || !user.isTwoFactorEnabled || !user.twoFactorSecret) {
            throw new BadRequestException("2FA is not enabled on this account");
        }

        const [isPasswordMatch, result] = await Promise.all([
            bcrypt.compare(password, user.password),
            verify({
                secret: user.twoFactorSecret,
                token: code,
            }),
        ]);

        if (!isPasswordMatch) {
            throw new UnauthorizedException("Invalid Password");
        }

        if (!result.valid) {
            throw new UnauthorizedException("Invalid 2FA code");
        }

        await this.prismaService.$transaction([
            this.prismaService.recoveryCode.deleteMany({
                where: { userId },
            }),
            this.prismaService.user.update({
                where: { id: userId },
                data: {
                    isTwoFactorEnabled: false,
                    twoFactorSecret: null,
                },
            }),
        ]);

        return {
            message: "Two-Factor authentication has been successfully disabled.",
        };
    }

    async refresh(refreshToken: string) {

        if (!refreshToken) {
            throw new UnauthorizedException("Refresh token is required");
        }

        const payload: TokenUser = await this.TokenToUser(refreshToken);

        const expireDateTime = new Date(payload.exp * 1000).toString().split("(")[0].trim().slice(4);

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

        const [isMatch, newAccessToken] = await Promise.all([
            bcrypt.compare(refreshToken, user.hashedRefreshToken),
            this.generateToken(payload.id, payload.email, payload.role, 'ACCESS')
        ]);

        if (!isMatch) {
            throw new UnauthorizedException("Access Denied: Invalid refresh token");
        }

        return {
            message: "Successfully refreshed the access token",
            newAccessToken,
            refreshExpiresAt: expireDateTime,
        }
    }

    async logout(id: string) {
        await this.checkSession(id);

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

    async checkSession(id: string) {
        if (!id) {
            throw new BadRequestException("Invalid id value.")
        }

        const user = await this.prismaService.user.findUnique({
            where: {
                id,
            },
            select: {
                hashedRefreshToken: true,
            },
        });

        if (!user) {
            throw new NotFoundException(`User with id: "${id}" does not exist.`);
        }

        if (!user.hashedRefreshToken) {
            throw new BadRequestException("No active session found.")
        }

        return {
            message: "Session Active",
        }
    }

    async changePassword(user: TokenUser, oldPassword: string, newPassword: string) {
        if (!user || !oldPassword || !newPassword) {
            throw new BadRequestException("Invalid reqest parameter.");
        }

        if (oldPassword === newPassword) {
            throw new BadRequestException("New Password should be different from Old one.");
        }

        const currentUser = await this.prismaService.user.findUnique({
            where: { id: user.id },
            select: { password: true, isActive: true }
        });

        if (!currentUser) {
            throw new NotFoundException(`User with ID: ${user.id} not found`)
        }

        if (!currentUser.isActive) {
            throw new BadRequestException("User is deactivated.")
        }

        const [isOldPasswordMatch, hashedNewPassword] = await Promise.all([
            bcrypt.compare(oldPassword, currentUser.password),
            bcrypt.hash(newPassword, 10)
        ]);

        if (!isOldPasswordMatch) {
            throw new BadRequestException("Invalid Old Password.")
        }

        await this.prismaService.user.update({
            where: { id: user.id },
            data: {
                password: hashedNewPassword,
                hashedRefreshToken: null,
            },
            select: { id: true }
        });

        return {
            message: "Successfully Changed Password."
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
