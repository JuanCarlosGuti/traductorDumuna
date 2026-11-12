import { SetMetadata } from '@nestjs/common';

export const CLAVE_PUBLICO = 'auth:publico';

/** Marks a route as reachable without a session (login and little else). */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);