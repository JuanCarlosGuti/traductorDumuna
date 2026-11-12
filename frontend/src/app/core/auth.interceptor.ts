import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Adds the token to every API call and, if the server answers 401
 * (session expired or signing secret changed), cleans up and sends to login.
 */
export const authInterceptor: HttpInterceptorFn = (peticion, siguiente) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();

  const conToken =
    token && peticion.url.startsWith('/api/')
      ? peticion.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : peticion;

  return siguiente(conToken).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        auth.salir();
        // Login itself returns 401 on bad credentials: no redirect
        // there, since we are already on the right screen.
        if (!peticion.url.endsWith('/api/auth/login')) {
          void router.navigate(['/entrar']);
        }
      }
      return throwError(() => error);
    }),
  );
};
