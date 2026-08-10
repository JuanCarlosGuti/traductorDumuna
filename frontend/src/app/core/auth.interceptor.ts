import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Añade el token a cada llamada a la API y, si el servidor responde 401
 * (sesión caducada o secreto de firma cambiado), limpia y manda al login.
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
        // El login mismo devuelve 401 con credenciales malas: ahí no se
        // redirige, que ya se está en la pantalla correcta.
        if (!peticion.url.endsWith('/api/auth/login')) {
          void router.navigate(['/entrar']);
        }
      }
      return throwError(() => error);
    }),
  );
};
