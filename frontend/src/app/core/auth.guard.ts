import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Deja pasar si hay sesión, o si este servidor no exige ninguna. */
export const sesionIniciada: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.autenticado()) return true;
  if (!(await auth.exigeSesion())) return true;
  return router.createUrlTree(['/entrar']);
};
