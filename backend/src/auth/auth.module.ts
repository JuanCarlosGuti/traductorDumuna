import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { CONFIG_AUTH, ConfigAuth, leerConfigAuth } from './auth.config';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Module({})
export class AuthModule {
  /**
   * The config is resolved only once and shared between the guard, the
   * controller and token signing; tests inject it by hand instead
   * of manipulating process.env.
   */
  static forRoot(config: ConfigAuth = leerConfigAuth()): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        JwtModule.register({
          secret: config.secreto,
          signOptions: { expiresIn: `${config.duracionDias}d` },
        }),
      ],
      controllers: [AuthController],
      providers: [
        { provide: CONFIG_AUTH, useValue: config },
        AuthService,
        // Global: protects ALL the app's routes, not only the ones in this
        // module. Anything left outside must be marked with @Publico().
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
      exports: [AuthService, CONFIG_AUTH],
    };
  }
}
