import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'alice@example.com', maxLength: 320 })
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  loginIdentifier!: string;

  @ApiProperty({ example: 'correct-horse-battery-staple', maxLength: 1024, format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;
}
