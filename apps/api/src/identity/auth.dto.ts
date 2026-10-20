import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString() @MinLength(1) @MaxLength(320) loginIdentifier!: string;
  @IsString() @MinLength(1) @MaxLength(1024) password!: string;
}
