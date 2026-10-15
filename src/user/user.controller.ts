import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt.guard.js';
import { UserService } from './user.service.js';
import { CreateAdminDto } from './dto/create-admin.dto.js';
import { AdminGuard } from '../guards/admin.guard.js';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {

    constructor(private readonly userService: UserService) { }

    @Post("create/admin")
    @UseGuards(AdminGuard)
    createAdmin(@Body() createAdminDto: CreateAdminDto) {
        return this.userService.createAdmin(createAdminDto);
    }
}
