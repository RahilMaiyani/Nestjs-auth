import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from '../guards/jwt.guard.js';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import type { TokenUser } from '../globel.types.js';

@Controller('auth')
export class AuthController {

    constructor(private readonly authService: AuthService) { }

    @Post('register')
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
    checkSession(@Body('id') id: string) {
        return this.authService.checkSession(id);
    }

    @Post("change-password")
    @UseGuards(JwtAuthGuard)
    changePassword(@CurrentUser() user: TokenUser, @Body("oldPassword") oldPassword: string, @Body('newPassword') newPassword: string) {
        return this.authService.changePassword(user, oldPassword, newPassword);
    }


}
