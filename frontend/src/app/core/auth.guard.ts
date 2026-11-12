import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Lets through if there is a session, or if this server requires none. */
export const sesionIniciada: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.autenticado()) return true;
  if (!(await auth.exigeSesion())) return true;
  return router.createUrlTree(['/entrar']);
};
