import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

interface RespuestaLogin {
  token: string;
  usuario: string;
  duracionDias: number;
}

const CLAVE_TOKEN = 'damana.token';
const CLAVE_USUARIO = 'damana.usuario';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _token = signal<string | null>(leer(CLAVE_TOKEN));
  private readonly _usuario = signal<string | null>(leer(CLAVE_USUARIO));

  /**
   * null until the server has been asked. Locally, with no
   * credentials configured, the API comes open and no login is required.
   */
  private readonly _exigeSesion = signal<boolean | null>(null);

  readonly usuario = this._usuario.asReadonly();
  readonly autenticado = computed(() => this._token() !== null);

  token(): string | null {
    return this._token();
  }

  /** Queried only once per app load. */
  async exigeSesion(): Promise<boolean> {
    const conocido = this._exigeSesion();
    if (conocido !== null) return conocido;
    try {
      const { activa } = await firstValueFrom(
        this.http.get<{ activa: boolean }>('/api/auth/estado'),
      );
      this._exigeSesion.set(activa);
      return activa;
    } catch {
      // If it cannot be asked, the safe option is assumed: require a session.
      this._exigeSesion.set(true);
      return true;
    }
  }

  async entrar(usuario: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<RespuestaLogin>('/api/auth/login', { usuario, password }),
    );
    guardar(CLAVE_TOKEN, res.token);
    guardar(CLAVE_USUARIO, res.usuario);
    this._token.set(res.token);
    this._usuario.set(res.usuario);
  }

  salir(): void {
    borrar(CLAVE_TOKEN);
    borrar(CLAVE_USUARIO);
    this._token.set(null);
    this._usuario.set(null);
  }
}

// localStorage can throw (Safari private mode, blocked cookies):
// in that case the session lasts as long as the tab, which is better than an error.
function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(clave: string, valor: string): void {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* in-memory session only */
  }
}

function borrar(clave: string): void {
  try {
    localStorage.removeItem(clave);
  } catch {
    /* nothing to clean up */
  }
}
