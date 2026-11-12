import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

interface LoginResponse {
  token: string;
  user: string;
  durationDays: number;
}

const TOKEN_KEY = 'damana.token';
const USER_KEY = 'damana.usuario';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _token = signal<string | null>(read(TOKEN_KEY));
  private readonly _user = signal<string | null>(read(USER_KEY));

  /**
   * null until the server has been asked. Locally, with no
   * credentials configured, the API comes open and no login is required.
   */
  private readonly _requiresSession = signal<boolean | null>(null);

  readonly user = this._user.asReadonly();
  readonly authenticated = computed(() => this._token() !== null);

  token(): string | null {
    return this._token();
  }

  /** Queried only once per app load. */
  async requiresSession(): Promise<boolean> {
    const known = this._requiresSession();
    if (known !== null) return known;
    try {
      const { active } = await firstValueFrom(
        this.http.get<{ active: boolean }>('/api/auth/status'),
      );
      this._requiresSession.set(active);
      return active;
    } catch {
      // If it cannot be asked, the safe option is assumed: require a session.
      this._requiresSession.set(true);
      return true;
    }
  }

  async signIn(user: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<LoginResponse>('/api/auth/login', { user, password }),
    );
    save(TOKEN_KEY, res.token);
    save(USER_KEY, res.user);
    this._token.set(res.token);
    this._user.set(res.user);
  }

  signOut(): void {
    remove(TOKEN_KEY);
    remove(USER_KEY);
    this._token.set(null);
    this._user.set(null);
  }
}

// localStorage can throw (Safari private mode, blocked cookies):
// in that case the session lasts as long as the tab, which is better than an error.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* in-memory session only */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to clean up */
  }
}
