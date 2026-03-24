import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { SignupDto } from './dto/signup.dto';

type JwtUser = { id: number; email: string | null };

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async findOrCreateGoogleUser(params: {
    provider: string;
    providerId: string;
    email?: string | null;
    name?: string | null;
    picture?: string | null;
  }) {
    const { provider, providerId, email, name, picture } = params;

    const existingByProvider = await this.prisma.user.findUnique({
      where: { provider_providerId: { provider, providerId } },
    });
    if (existingByProvider) {
      return existingByProvider;
    }

    if (email) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email },
      });
      if (existingByEmail) {
        if (!existingByEmail.provider || !existingByEmail.providerId) {
          return this.prisma.user.update({
            where: { id: existingByEmail.id },
            data: { provider, providerId },
          });
        }
        return existingByEmail;
      }
    }

    return this.prisma.user.create({
      data: {
        email: email || `google_${providerId}@no-email.google`,
        provider,
        providerId,
        name: name || undefined,
        picture: picture || undefined,
      },
    });
  }

  issueTokens(user: JwtUser) {
    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload);
    const refreshSeconds =
      Number(process.env.JWT_REFRESH_EXPIRES) &&
      Number(process.env.JWT_REFRESH_EXPIRES) > 0
        ? Number(process.env.JWT_REFRESH_EXPIRES)
        : 60 * 60 * 24 * 7;
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: refreshSeconds,
    });
    return { accessToken, refreshToken };
  }

  async signup(signupDto: SignupDto) {
    const { email, password } = signupDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create new user
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
    });

    // Issue tokens
    const tokens = this.issueTokens({
      id: user.id,
      email: user.email,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
      },
      tokens,
    };
  }
}
