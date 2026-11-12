import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginView {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = signal('');
  protected readonly password = signal('');
  protected readonly signingIn = signal(false);
  protected readonly error = signal('');

  protected async submit(): Promise<void> {
    if (this.signingIn()) return;
    this.signingIn.set(true);
    this.error.set('');
    try {
      await this.auth.signIn(this.user(), this.password());
      await this.router.navigate(['/buscar']);
    } catch (e: unknown) {
      this.error.set(messageOf(e));
      this.password.set('');
    } finally {
      this.signingIn.set(false);
    }
  }
}

function messageOf(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 429) {
    return 'Demasiados intentos fallidos. Espera unos minutos.';
  }
  if (status === 401) return 'Usuario o contraseña incorrectos.';
  if (status === 0) return 'No se pudo contactar con el servidor.';
  return 'No se pudo entrar. Inténtalo de nuevo.';
}
