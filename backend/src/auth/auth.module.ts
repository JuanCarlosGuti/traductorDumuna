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
   * La config se resuelve una sola vez y se comparte entre el guard, el
   * controlador y la firma de tokens; los tests la inyectan a mano en vez
   * de manipular process.env.
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
        // Global: protege TODAS las rutas de la app, no solo las de este
        // módulo. Lo que quede fuera hay que marcarlo con @Publico().
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
      exports: [AuthService, CONFIG_AUTH],
    };
  }
}
