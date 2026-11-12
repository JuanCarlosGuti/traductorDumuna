import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'auth:publico';

/** Marks a route as reachable without a session (login and little else). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);