import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

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
}
