import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAdminDto } from './dto/create-admin.dto.js';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {

    constructor(private readonly prismaService: PrismaService) { }

    async createAdmin(createAdminDto: CreateAdminDto) {
        const { email, password, name } = createAdminDto;

        const existing = await this.prismaService.user.findUnique({
            where: {
                email
            }
        });

        if (existing) {
            throw new ConflictException("User with this email already exists");
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newAdmin = await this.prismaService.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                role: "ADMIN",
            },
            select: {
                id: true,
            }
        });

        return {
            message: "Admin created succesfully",
            newAdmin: {
                id: newAdmin.id,
                email,
                name,
                role: "ADMIN",
            }
        }
    }

}
