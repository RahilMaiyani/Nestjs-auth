import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

export class RegisterDto {
    @IsString()
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(6, { message: "Password should be atleast 6 characters long." })
    password: string;

    @IsString()
    @IsNotEmpty()
    name: string;
}