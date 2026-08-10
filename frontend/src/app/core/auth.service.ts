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
   * null mientras no se ha preguntado al servidor. En local, sin
   * credenciales configuradas, la API viene abierta y no se pide login.
   */
  private readonly _exigeSesion = signal<boolean | null>(null);

  readonly usuario = this._usuario.asReadonly();
  readonly autenticado = computed(() => this._token() !== null);

  token(): string | null {
    return this._token();
  }

  /** Se consulta una sola vez por carga de la app. */
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
      // Si no se puede preguntar, se asume lo seguro: pedir sesión.
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

// localStorage puede lanzar (modo privado de Safari, cookies bloqueadas):
// en ese caso la sesión dura lo que la pestaña, que es mejor que un error.
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
    /* sesión solo en memoria */
  }
}

function borrar(clave: string): void {
  try {
    localStorage.removeItem(clave);
  } catch {
    /* nada que limpiar */
  }
}
