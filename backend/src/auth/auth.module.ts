import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { CONFIG_AUTH, ConfigAuth, readAuthConfig } from './auth.config';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Module({})
export class AuthModule {
  /**
   * The config is resolved only once and shared between the guard, the
   * controller and token signing; tests inject it by hand instead
   * of manipulating process.env.
   */
  static forRoot(config: ConfigAuth = readAuthConfig()): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        JwtModule.register({
          secret: config.secret,
          signOptions: { expiresIn: `${config.durationDays}d` },
        }),
      ],
      controllers: [AuthController],
      providers: [
        { provide: CONFIG_AUTH, useValue: config },
        AuthService,
        // Global: protects ALL the app's routes, not only the ones in this
        // module. Anything left outside must be marked with @Public().
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
      exports: [AuthService, CONFIG_AUTH],
    };
  }
}
