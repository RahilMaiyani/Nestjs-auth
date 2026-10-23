import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from '../guards/jwt.guard.js';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import type { TokenUser } from '../global.types.js';
import { hours, minutes, Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../guards/admin.guard.js';

@Controller('auth')
@Throttle({ default: { ttl: minutes(30), limit: 30 } })
export class AuthController {

    constructor(private readonly authService: AuthService) { }

    @Post('register')
    @Throttle({ default: { ttl: hours(1), limit: 5 } })
    register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    @Post('login')
    login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Post('refresh')
    refresh(@Body('refreshToken') refreshToken: string) {
        return this.authService.refresh(refreshToken);
    }

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    logout(@CurrentUser() user: TokenUser) {
        return this.authService.logout(user.id);
    }

    @Post("session")
    @Throttle({ default: { limit: 15, ttl: minutes(1) } })
    checkSession(@Body('id') id: string) {
        return this.authService.checkSession(id);
    }

    @Post("change-password")
    @UseGuards(JwtAuthGuard)
    changePassword(@CurrentUser() user: TokenUser, @Body("oldPassword") oldPassword: string, @Body('newPassword') newPassword: string) {
        return this.authService.changePassword(user, oldPassword, newPassword);
    }

    @Post("2fa/generate")
    @UseGuards(JwtAuthGuard)
    generate2FA(@CurrentUser() user: TokenUser) {
        return this.authService.generate2FA(user.id, user.email);
    }

    @Post("2fa/enable")
    @UseGuards(JwtAuthGuard)
    enable2FA(@CurrentUser() user: TokenUser, @Body("code") code: string) {
        return this.authService.enable2FA(user.id, code);
    }

    @Post('2fa/authenticate')
    authenticate2FA(@Body('preAuthToken') preAuthToken: string, @Body('code') code: string) {
        return this.authService.authenticate2FA(preAuthToken, code);
    }

    @Post('2fa/disable')
    @UseGuards(JwtAuthGuard)
    disable2FA(@CurrentUser() user: TokenUser, @Body('password') password: string, @Body('code') code: string) {
        return this.authService.disable2FA(user.id, password, code);
    }

    @Get('all/current/sessions')
    @UseGuards(JwtAuthGuard, AdminGuard)
    getAllCurrentSessions(@Query('min') min: string) {
        if (min) {
            const minutes = parseInt(min);
            return this.authService.getCurrentSessions(minutes);
        }
        return this.authService.getCurrentSessions();
    }
}
