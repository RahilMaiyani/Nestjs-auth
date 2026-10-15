import { IsEmail, IsIn, IsNotEmpty, IsString } from "class-validator";

export class RegisterDto {
    @IsString()
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    password: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsIn(['admin', 'user'])
    role?: string;

}