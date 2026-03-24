import { IsEmail, IsNotEmpty } from 'class-validator';
import { IsStrongPassword } from '../validators/decorators';

export class SignupDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsStrongPassword()
  @IsNotEmpty()
  password: string;
}
