import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAdminDto } from './dto/create-admin.dto.js';
import * as bcrypt from 'bcrypt';
import type { TokenUser } from '../global.types.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { Prisma } from '../generated/prisma/browser.js';
import { isBoolean } from 'class-validator';

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

    async getAllUser(search: string = "", page: string = '1', role: string = "", active: string) {
        const limit = 10;
        role = role.toLowerCase();

        if (!page) {
            page = '1';
        }
        if (!search) {
            search = '';
        }

        let pageNumber = parseInt(page);
        const note = [];

        if (!['admin', 'user', 'all', 'a', 'u', ""].includes(role)) {
            role = '';
            note.push("Invalid role value choose ['admin', 'user', 'all', 'a', 'u'].");
        }

        let filterRole: "USER" | "ADMIN" | undefined;
        if (role[0] == 'a' || role[0] == 'A') {
            filterRole = "ADMIN";
        }
        else if (role[0] == 'u' || role[0] == 'U') {
            filterRole = 'USER';
        }

        const skip = (pageNumber - 1) * (limit);

        let Active: boolean | undefined = (active === 'true') ? true : ((active === 'false') ? false : undefined);

        const where: Prisma.UserWhereInput = {
            ...(search ? { email: { contains: search } } : {}),
            role: filterRole || undefined,
            isActive: isBoolean(Active) ? Active : undefined,
        };

        const [users, filterTotalCount, totalUsers] = await Promise.all([
            this.prismaService.user.findMany({
                where,
                skip,
                take: limit,
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    isActive: true,
                    createdAt: true,
                    updatedAt: true,
                }
            }),
            this.prismaService.user.count({ where }),
            this.prismaService.user.count(),
        ]);

        const totalPage = Math.ceil(totalUsers / limit);

        if (pageNumber > totalPage) {
            pageNumber = 1;
            note.push(" Page not exists");
        }

        return {
            totalUsers,
            filteredTotalUserCount: filterTotalCount,
            totalPage,
            pageNumber,
            users,
            hasNextPage: pageNumber < totalPage,
            limit,
            note: note.join(),
        }
    }

    async getMe(user: TokenUser) {
        const { id, email } = user;

        if (!user) {
            throw new NotFoundException("User not found!");
        }

        const currentUser = await this.prismaService.user.findUnique({
            where: { id },
            select: { name: true, isActive: true, createdAt: true, updatedAt: true }
        });

        if (!currentUser) {
            throw new NotFoundException("User not found!");
        }

        const { name, isActive, createdAt, updatedAt } = currentUser;

        return {
            user: {
                id,
                email,
                name,
                isActive,
                createdAt,
                updatedAt,
            }
        }
    }

    async updateMe(id: string, updateUserDto: UpdateUserDto) {
        const { name } = updateUserDto;

        if (!name || !id) {
            throw new BadRequestException("Invalid inputs");
        }

        await this.prismaService.user.update({
            where: {
                id,
            },
            data: {
                name
            }
        });

        return {
            message: "User details updated successfully."
        }
    }
}
