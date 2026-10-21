import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { segmentarFragmento } from '../../comun/fragmento';
import { normalizar } from '../../comun/normalizador';
import { UMasDirective } from '../../comun/u-mas.directive';
import { ApiService } from '../../core/api.service';
import {
  DireccionTraduccion,
  DominioCorpus,
  EstadoTraductor,
  FragmentoEjemplo,
  OrigenValidacion,
  RespuestaTraduccion,
} from '../../core/modelos';

interface SegmentoTraduccion {
  texto: string;
  sinEquivalente: boolean;
}

interface GrupoEjemplos {
  dominio: DominioCorpus;
  titulo: string;
  ejemplos: FragmentoEjemplo[];
}

const TITULOS_DOMINIO: Record<DominioCorpus, string> = {
  cotidiano: 'Ejemplos cotidianos',
  gramatica: 'Ejemplos de gramática (conjugaciones)',
  biblico: 'Ejemplos del corpus bíblico',
};
const ORDEN_DOMINIOS: DominioCorpus[] = ['cotidiano', 'gramatica', 'biblico'];

type EstadoValidacion = 'ninguna' | 'guardando' | OrigenValidacion;

@Component({
  selector: 'app-traductor',
  imports: [UMasDirective, RouterLink],
  templateUrl: './traductor.html',
  styleUrl: './traductor.css',
})
export class Traductor {
  private readonly api = inject(ApiService);

  protected readonly estado = signal<EstadoTraductor | null>(null);
  protected readonly texto = signal('');
  protected readonly direccion = signal<DireccionTraduccion>('espanol_a_damana');
  protected readonly resultado = signal<RespuestaTraduccion | null>(null);
  protected readonly error = signal('');
  protected readonly cargando = signal(false);

  /** Texto que se tradujo (la caja puede cambiar después). */
  protected readonly textoTraducido = signal('');
  protected readonly validacion = signal<EstadoValidacion>('ninguna');
  protected readonly totalValidadas = signal(0);
  protected readonly corrigiendo = signal(false);
  protected readonly correccion = signal('');
  protected readonly errorValidacion = signal('');

  /** Traducción sin corchetes, con las palabras sin equivalente marcadas. */
  protected readonly segmentos = computed<SegmentoTraduccion[]>(() => {
    const r = this.resultado();
    if (!r) return [];
    const sinEquivalente = new Set(r.palabrasSinEquivalente.map((p) => normalizar(p)));
    const limpia = r.traduccion.replace(/\[([^\]]+)\]/g, '$1');
    return segmentarFragmento(limpia).map((s) => ({
      texto: s.texto,
      sinEquivalente: s.esPalabra && sinEquivalente.has(normalizar(s.texto)),
    }));
  });

  protected readonly ejemplosPorDominio = computed<GrupoEjemplos[]>(() => {
    const r = this.resultado();
    if (!r) return [];
    return ORDEN_DOMINIOS.map((dominio) => ({
      dominio,
      titulo: TITULOS_DOMINIO[dominio],
      ejemplos: r.ejemplos.filter((e) => e.dominio === dominio),
    })).filter((g) => g.ejemplos.length > 0);
  });

  protected readonly confianzaPorciento = computed(() =>
    Math.round((this.resultado()?.confianza ?? 0) * 100),
  );

  constructor() {
    void this.cargarEstado();
  }

  private async cargarEstado(): Promise<void> {
    try {
      this.estado.set(await this.api.traductorEstado());
    } catch {
      this.estado.set(null);
      this.error.set('No se pudo consultar el estado del traductor. ¿Está corriendo el backend?');
    }
  }

  protected async traducir(evento: Event): Promise<void> {
    evento.preventDefault();
    const texto = this.texto().trim();
    if (!texto || this.cargando()) return;

    this.cargando.set(true);
    this.error.set('');
    this.reiniciarValidacion();
    try {
      this.resultado.set(await this.api.traducir(texto, this.direccion()));
      this.textoTraducido.set(texto);
    } catch (e) {
      this.resultado.set(null);
      this.error.set(this.mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  private reiniciarValidacion(): void {
    this.validacion.set('ninguna');
    this.corrigiendo.set(false);
    this.correccion.set('');
    this.errorValidacion.set('');
  }

  /** Botón «esta traducción es correcta». */
  protected confirmar(): Promise<void> {
    const r = this.resultado();
    if (!r) return Promise.resolve();
    return this.guardarValidacion(r.traduccion, 'confirmada');
  }

  protected abrirCorreccion(): void {
    this.correccion.set(this.resultado()?.traduccion.replace(/\[([^\]]+)\]/g, '$1') ?? '');
    this.corrigiendo.set(true);
    this.errorValidacion.set('');
  }

  protected cancelarCorreccion(): void {
    this.corrigiendo.set(false);
  }

  /** Botón «guardar corrección»: el par corregido vale igual que uno confirmado. */
  protected guardarCorreccion(): Promise<void> {
    const texto = this.correccion().trim();
    if (!texto) return Promise.resolve();
    return this.guardarValidacion(texto, 'corregida');
  }

  private async guardarValidacion(traduccion: string, origen: OrigenValidacion): Promise<void> {
    const r = this.resultado();
    if (!r || this.validacion() === 'guardando') return;
    this.validacion.set('guardando');
    this.errorValidacion.set('');
    try {
      const respuesta = await this.api.validarTraduccion({
        texto: this.textoTraducido(),
        direccion: this.direccion(),
        traduccion,
        origen,
        traduccionModelo: r.traduccion,
      });
      this.totalValidadas.set(respuesta.total);
      this.validacion.set(origen);
      this.corrigiendo.set(false);
    } catch (e) {
      this.validacion.set('ninguna');
      this.errorValidacion.set(this.mensajeDeError(e));
    }
  }

  private mensajeDeError(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 0) {
        return 'No se pudo contactar el backend. ¿Está corriendo en el puerto 3000?';
      }
      const mensaje = (e.error as { message?: string | string[] })?.message;
      if (Array.isArray(mensaje)) return mensaje.join('; ');
      if (typeof mensaje === 'string') return mensaje;
    }
    return 'Error inesperado al traducir. Reintenta.';
  }

  protected intercambiarDireccion(): void {
    this.direccion.set(
      this.direccion() === 'damana_a_espanol' ? 'espanol_a_damana' : 'damana_a_espanol',
    );
  }

  /** Idioma del lado damana en la glosa, para marcar lang="mbp" donde toca. */
  protected destinoEsDamana(): boolean {
    return this.direccion() === 'espanol_a_damana';
  }
}
