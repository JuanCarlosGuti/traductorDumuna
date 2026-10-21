import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Calificacion,
  DireccionTraduccion,
  EntradaVocabulario,
  EstadoSrs,
  EstadoTraductor,
  FichaPalabra,
  Frase,
  Frecuencia,
  Idioma,
  Lema,
  Pendiente,
  ProgresoActualizado,
  RespuestaBusqueda,
  RespuestaTraduccion,
  TablaConjugacion,
  ValidacionGuardada,
  ValidarTraduccion,
} from './modelos';

export interface ArchivoDescargado {
  blob: Blob;
  nombreArchivo: string;
}

/** Nombre del adjunto de una cabecera Content-Disposition (o el de reserva). */
export function nombreDeAdjunto(contentDisposition: string | null, reserva: string): string {
  const m = /filename="?([^";]+)"?/i.exec(contentDisposition ?? '');
  return m ? m[1] : reserva;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  buscar(
    q: string,
    idioma: Idioma,
    fuente?: string,
    limite = 100,
  ): Promise<RespuestaBusqueda> {
    let params = new HttpParams()
      .set('q', q)
      .set('idioma', idioma)
      .set('limite', limite);
    if (fuente) params = params.set('fuente', fuente);
    return firstValueFrom(
      this.http.get<RespuestaBusqueda>('/api/buscar', { params }),
    );
  }

  palabra(token: string): Promise<FichaPalabra> {
    return firstValueFrom(
      this.http.get<FichaPalabra>(`/api/palabra/${encodeURIComponent(token)}`),
    );
  }

  frecuencias(limite = 10000): Promise<Frecuencia[]> {
    const params = new HttpParams().set('limite', limite);
    return firstValueFrom(this.http.get<Frecuencia[]>('/api/frecuencias', { params }));
  }

  vocabulario(): Promise<EntradaVocabulario[]> {
    return firstValueFrom(this.http.get<EntradaVocabulario[]>('/api/vocabulario'));
  }

  frases(): Promise<Frase[]> {
    return firstValueFrom(this.http.get<Frase[]>('/api/frases'));
  }

  srsSiguiente(): Promise<EstadoSrs> {
    return firstValueFrom(this.http.get<EstadoSrs>('/api/srs/siguiente'));
  }

  srsResponder(palabra: string, calificacion: Calificacion): Promise<ProgresoActualizado> {
    return firstValueFrom(
      this.http.post<ProgresoActualizado>('/api/srs/respuesta', { palabra, calificacion }),
    );
  }

  gramaticaLemas(): Promise<Lema[]> {
    return firstValueFrom(this.http.get<Lema[]>('/api/gramatica/lemas'));
  }

  gramaticaTabla(lema: string): Promise<TablaConjugacion> {
    return firstValueFrom(
      this.http.get<TablaConjugacion>(`/api/gramatica/lemas/${encodeURIComponent(lema)}`),
    );
  }

  traductorEstado(): Promise<EstadoTraductor> {
    return firstValueFrom(this.http.get<EstadoTraductor>('/api/traducir/estado'));
  }

  traducir(texto: string, direccion: DireccionTraduccion): Promise<RespuestaTraduccion> {
    return firstValueFrom(
      this.http.post<RespuestaTraduccion>('/api/traducir', { texto, direccion }),
    );
  }

  validarTraduccion(cuerpo: ValidarTraduccion): Promise<ValidacionGuardada> {
    return firstValueFrom(
      this.http.post<ValidacionGuardada>('/api/traducir/validar', cuerpo),
    );
  }

  pendientes(): Promise<Pendiente[]> {
    return firstValueFrom(this.http.get<Pendiente[]>('/api/pendientes'));
  }

  /** Genera y descarga el lote Excel para las hablantes; el servidor marca las filas como exportadas. */
  async exportarPendientes(): Promise<ArchivoDescargado> {
    const respuesta = await firstValueFrom(
      this.http.post('/api/pendientes/exportar', null, {
        responseType: 'blob',
        observe: 'response',
      }),
    );
    return {
      blob: respuesta.body ?? new Blob(),
      nombreArchivo: nombreDeAdjunto(
        respuesta.headers.get('content-disposition'),
        'formato_elicitacion_pendientes.xlsx',
      ),
    };
  }
}
