import { IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateUserDto {
    @IsOptional()
    @IsString({ message: "Name should be a string." })
    @IsNotEmpty({ message: "Name not found in body" })
    @MinLength(3, { message: "Minimum name length should be 3 characters." })
    name?: string;
}