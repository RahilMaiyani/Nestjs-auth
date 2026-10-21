import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt.guard.js';
import { UserService } from './user.service.js';
import { CreateAdminDto } from './dto/create-admin.dto.js';
import { AdminGuard } from '../guards/admin.guard.js';
import { minutes, Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import type { TokenUser } from '../global.types.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {

    constructor(private readonly userService: UserService) { }

    @Post("create/admin")
    @Throttle({ default: { ttl: minutes(30), limit: 20 } })
    @UseGuards(AdminGuard)
    createAdmin(@Body() createAdminDto: CreateAdminDto) {
        return this.userService.createAdmin(createAdminDto);
    }

    @Post("status/:state/:id")
    @UseGuards(AdminGuard)
    deactivateUser(@Param('state') state: string, @Param('id') id: string) {
        return this.userService.userStatusChange(id, state);
    }

    @Get("all")
    @UseGuards(AdminGuard)
    getAllusers(@Query('search') search: string, @Query('page') page: string, @Query('role') role: string) {
        return this.userService.getAllUser(search, page, role);
    }

    @Get('me')
    getMe(@CurrentUser() user: TokenUser) {
        return this.userService.getMe(user);
    }

    @Post('update')
    updateMe(@CurrentUser() user: TokenUser, @Body() updateUserDto: UpdateUserDto) {
        return this.userService.updateMe(user, updateUserDto);
    }
}
