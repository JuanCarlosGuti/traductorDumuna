import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { asentar, buscarTodos, montar, texto } from '../../comun/probar';
import { nombreDeAdjunto } from '../../core/api.service';
import { Pendiente } from '../../core/modelos';
import { Pendientes } from './pendientes';

const PENDIENTES: Pendiente[] = [
  {
    id: 1,
    palabra: 'vecina',
    idioma: 'espanol',
    contexto: 'mi vecina cocina',
    vecesPedida: 3,
    estado: 'pendiente',
    origen: 'traductor',
    creadoEn: '2026-10-01T00:00:00.000Z',
    actualizadoEn: '2026-10-02T00:00:00.000Z',
  },
  {
    id: 2,
    palabra: 'kʉzhigui',
    idioma: 'damana',
    contexto: 'kʉzhigui gontka',
    vecesPedida: 1,
    estado: 'pendiente',
    origen: 'traductor',
    creadoEn: '2026-10-01T00:00:00.000Z',
    actualizadoEn: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 3,
    palabra: 'ñame',
    idioma: 'espanol',
    contexto: null,
    vecesPedida: 1,
    estado: 'resuelta',
    origen: 'elicitacion',
    creadoEn: '2026-09-01T00:00:00.000Z',
    actualizadoEn: '2026-09-02T00:00:00.000Z',
  },
];

describe('nombreDeAdjunto', () => {
  it('saca el nombre del Content-Disposition o usa el de reserva', () => {
    expect(nombreDeAdjunto('attachment; filename="formato_elicitacion_pendientes_2026-10-03.xlsx"', 'x.xlsx')).toBe(
      'formato_elicitacion_pendientes_2026-10-03.xlsx',
    );
    expect(nombreDeAdjunto(null, 'x.xlsx')).toBe('x.xlsx');
  });
});

describe('Pendientes', () => {
  let fixture: ComponentFixture<Pendientes>;
  let http: HttpTestingController;

  const arrancar = async (lista: Pendiente[] = PENDIENTES) => {
    fixture = await montar(Pendientes);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/pendientes').flush(lista);
    await asentar(fixture);
  };

  afterEach(() => http.verify());

  it('lista las abiertas ordenadas como vienen y oculta las resueltas por defecto', async () => {
    await arrancar();
    const filas = buscarTodos(fixture, 'tbody tr');
    expect(filas.length).toBe(2);
    expect(filas[0].textContent).toContain('vecina');
    expect(filas[0].textContent).toContain('3');
    expect(filas[1].querySelector('td')?.getAttribute('lang')).toBe('mbp'); // kʉzhigui es damana
    expect(texto(fixture)).not.toContain('ñame');
    expect(texto(fixture)).toContain('Exportar lote (2)');
  });

  it('«ver también las resueltas» las muestra', async () => {
    await arrancar();
    const casilla = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type=checkbox]')!;
    casilla.click();
    await asentar(fixture);
    expect(texto(fixture)).toContain('ñame');
    expect(buscarTodos(fixture, 'tbody tr').length).toBe(3);
  });

  it('sin pendientes lo dice y deshabilita la exportación', async () => {
    await arrancar([]);
    expect(texto(fixture)).toContain('No hay pendientes');
    const boton = buscarTodos(fixture, 'button').find((b) => /Exportar/.test(b.textContent ?? ''))!;
    expect((boton as HTMLButtonElement).disabled).toBe(true);
  });

  it('exportar pide el Excel, lanza la descarga con el nombre del servidor y recarga la lista', async () => {
    const crear = vi.fn(() => 'blob:falso');
    const revocar = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = crear;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revocar;
    try {
      await arrancar();
      buscarTodos(fixture, 'button').find((b) => /Exportar/.test(b.textContent ?? ''))!.click();
      await asentar(fixture);

      const peticion = http.expectOne('/api/pendientes/exportar');
      expect(peticion.request.method).toBe('POST');
      expect(peticion.request.responseType).toBe('blob');
      peticion.flush(new Blob(['xlsx']), {
        headers: { 'content-disposition': 'attachment; filename="formato_elicitacion_pendientes_2026-10-03.xlsx"' },
      });
      await asentar(fixture);

      http.expectOne('/api/pendientes').flush(PENDIENTES.map((p) => ({ ...p, estado: p.estado === 'pendiente' ? 'exportada' : p.estado })));
      await asentar(fixture);

      expect(crear).toHaveBeenCalledTimes(1);
      expect(revocar).toHaveBeenCalledWith('blob:falso');
      expect(texto(fixture)).toContain('formato_elicitacion_pendientes_2026-10-03.xlsx');
      expect(texto(fixture)).toContain('npm run importar');
      expect(buscarTodos(fixture, '.estado.exportada').length).toBe(2);
    } finally {
      delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
      delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
    }
  });

  it('un error al cargar se muestra', async () => {
    fixture = await montar(Pendientes);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/pendientes').flush({ message: 'base de datos bloqueada' }, { status: 500, statusText: 'Error' });
    await asentar(fixture);
    expect(texto(fixture)).toContain('base de datos bloqueada');
  });
});
