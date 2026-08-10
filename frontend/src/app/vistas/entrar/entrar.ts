import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-entrar',
  imports: [FormsModule],
  templateUrl: './entrar.html',
  styleUrl: './entrar.css',
})
export class Entrar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly usuario = signal('');
  protected readonly password = signal('');
  protected readonly entrando = signal(false);
  protected readonly error = signal('');

  protected async enviar(): Promise<void> {
    if (this.entrando()) return;
    this.entrando.set(true);
    this.error.set('');
    try {
      await this.auth.entrar(this.usuario(), this.password());
      await this.router.navigate(['/buscar']);
    } catch (e: unknown) {
      this.error.set(mensajeDe(e));
      this.password.set('');
    } finally {
      this.entrando.set(false);
    }
  }
}

function mensajeDe(error: unknown): string {
  const estado = (error as { status?: number } | null)?.status;
  if (estado === 429) {
    return 'Demasiados intentos fallidos. Espera unos minutos.';
  }
  if (estado === 401) return 'Usuario o contraseña incorrectos.';
  if (estado === 0) return 'No se pudo contactar con el servidor.';
  return 'No se pudo entrar. Inténtalo de nuevo.';
}
