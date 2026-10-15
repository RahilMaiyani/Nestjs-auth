import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
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

    async userStatusChange(id: string, state: string) {
        if (!id || !state || !['activate', 'deactivate'].includes(state)) {
            throw new BadRequestException("Invalid ID or state");
        }

        const exists = await this.prismaService.user.findUnique({
            where: { id },
            select: {
                isActive: true,
                email: true,
            }
        });

        if (!exists) {
            throw new BadRequestException("Invalid ID or user no longer exists")
        }

        if (exists.isActive ? (state === 'activate' ? true : false) : (state === 'deactivate' ? true : false)) {
            throw new BadRequestException(`User is already ${exists.isActive ? (state === 'activate' ? 'Active' : '') : (state === 'deactivate' ? 'Deactive' : '')}`);
        }

        await this.prismaService.user.update({
            where: { id },
            data: {
                isActive: state === 'activate' ? true : false
            }
        });

        return {
            message: `User: ${exists.email} successfully ${state}d.`
        }
    }

    async getAllUser(search: string = "", page: string = '1', role: string = "") {
        const limit = 10;

        if (!page) {
            page = '1';
        }
        if (!search) {
            search = '';
        }
        if (!role) {
            role = '';
        }

        let pageNumber = parseInt(page);
        const message = [];
        if (typeof pageNumber !== 'number') {
            pageNumber = 1;
            message.push(" | Invalid Page number");
        }

        if (!['', 'admin', 'user', 'a', 'u'].includes(role)) {
            role = '';
            message.push(" | Invalid role value choose ['admin', 'user', 'a', 'u'].");
        }

        const skip = (pageNumber - 1) * (limit);
        const totalUsers = await this.prismaService.user.count();
        const totalPage = Math.ceil(totalUsers / limit);

        if (pageNumber > totalPage) {
            pageNumber = 1;
            message.push(" | Page not exists");
        }

        const [users, filterTotalCount] = await Promise.all([
            this.prismaService.user.findMany({
                where: {
                    email: { contains: search }
                },
                skip,
                take: limit
            }),
            this.prismaService.user.count({
                where: {
                    email: { contains: search }
                },
            })
        ]);

        return {
            totalUsers,
            totalPage,
            pageNumber,
            limit,
            hasNextPage: pageNumber < totalPage,
            filteredTotalUserCount: filterTotalCount,
            users,
            message: message.join(),
        }





    }

}
