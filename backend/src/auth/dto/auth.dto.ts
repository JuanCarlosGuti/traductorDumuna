import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Username configured on the server' })
  @IsString()
  @IsNotEmpty()
  // Defensive cap: without it megabytes could be sent for the server
  // to hash on every attempt.
  @MaxLength(200)
  user!: string;

  @ApiProperty({ description: 'Password configured on the server' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password!: string;
}

export class SessionDto {
  @ApiProperty({ description: 'Session token; it goes in the Authorization: Bearer header' })
  token!: string;

  @ApiProperty()
  user!: string;

  @ApiProperty({ description: 'Days the session lasts before it expires' })
  durationDays!: number;
}

export class AuthStatusDto {
  @ApiProperty({
    description:
      'false when the server has no credentials configured and the API is open (local development only)',
  })
  active!: boolean;
}

export class UserDto {
  @ApiProperty()
  user!: string;
}
