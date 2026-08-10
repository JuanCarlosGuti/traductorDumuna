import { SetMetadata } from '@nestjs/common';

export const CLAVE_PUBLICO = 'auth:publico';

/** Marca una ruta accesible sin sesión (el login y poco más). */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);