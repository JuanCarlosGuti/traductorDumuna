import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { settle, queryAll, mount, text } from '../../shared/testing';
import { attachmentName } from '../../core/api.service';
import { PendingItem } from '../../core/models';
import { PendingView } from './pending';

const PENDING_ITEMS: PendingItem[] = [
  {
    id: 1,
    word: 'vecina',
    language: 'espanol',
    context: 'mi vecina cocina',
    timesRequested: 3,
    status: 'pendiente',
    origin: 'traductor',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
  },
  {
    id: 2,
    word: 'kʉzhigui',
    language: 'damana',
    context: 'kʉzhigui gontka',
    timesRequested: 1,
    status: 'pendiente',
    origin: 'traductor',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 3,
    word: 'ñame',
    language: 'espanol',
    context: null,
    timesRequested: 1,
    status: 'resuelta',
    origin: 'elicitacion',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
  },
];

describe('attachmentName', () => {
  it('takes the name from Content-Disposition or uses the fallback one', () => {
    expect(attachmentName('attachment; filename="formato_elicitacion_pendientes_2026-10-03.xlsx"', 'x.xlsx')).toBe(
      'formato_elicitacion_pendientes_2026-10-03.xlsx',
    );
    expect(attachmentName(null, 'x.xlsx')).toBe('x.xlsx');
  });
});

describe('Pendientes', () => {
  let fixture: ComponentFixture<PendingView>;
  let http: HttpTestingController;

  const start = async (list: PendingItem[] = PENDING_ITEMS) => {
    fixture = await mount(PendingView);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/pending').flush(list);
    await settle(fixture);
  };

  afterEach(() => http.verify());

  it('lists the open ones in the order they come and hides the resolved by default', async () => {
    await start();
    const rows = queryAll(fixture, 'tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('vecina');
    expect(rows[0].textContent).toContain('3');
    expect(rows[1].querySelector('td')?.getAttribute('lang')).toBe('mbp'); // kʉzhigui is Damana
    expect(text(fixture)).not.toContain('ñame');
    expect(text(fixture)).toContain('Exportar lote (2)');
  });

  it('«ver también las resueltas» shows them', async () => {
    await start();
    const checkbox = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type=checkbox]')!;
    checkbox.click();
    await settle(fixture);
    expect(text(fixture)).toContain('ñame');
    expect(queryAll(fixture, 'tbody tr').length).toBe(3);
  });

  it('without pending items it says so and disables the export', async () => {
    await start([]);
    expect(text(fixture)).toContain('No hay pendientes');
    const button = queryAll(fixture, 'button').find((b) => /Exportar/.test(b.textContent ?? ''))!;
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('exporting requests the Excel, triggers the download with the server name and reloads the list', async () => {
    const create = vi.fn(() => 'blob:falso');
    const revoke = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = create;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revoke;
    try {
      await start();
      queryAll(fixture, 'button').find((b) => /Exportar/.test(b.textContent ?? ''))!.click();
      await settle(fixture);

      const httpRequest = http.expectOne('/api/pending/export');
      expect(httpRequest.request.method).toBe('POST');
      expect(httpRequest.request.responseType).toBe('blob');
      httpRequest.flush(new Blob(['xlsx']), {
        headers: { 'content-disposition': 'attachment; filename="formato_elicitacion_pendientes_2026-10-03.xlsx"' },
      });
      await settle(fixture);

      http.expectOne('/api/pending').flush(PENDING_ITEMS.map((p) => ({ ...p, status: p.status === 'pendiente' ? 'exportada' : p.status })));
      await settle(fixture);

      expect(create).toHaveBeenCalledTimes(1);
      expect(revoke).toHaveBeenCalledWith('blob:falso');
      expect(text(fixture)).toContain('formato_elicitacion_pendientes_2026-10-03.xlsx');
      expect(text(fixture)).toContain('npm run importar');
      expect(queryAll(fixture, '.estado.exportada').length).toBe(2);
    } finally {
      delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
      delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
    }
  });

  it('a loading error is shown', async () => {
    fixture = await mount(PendingView);
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/pending').flush({ message: 'base de datos bloqueada' }, { status: 500, statusText: 'Error' });
    await settle(fixture);
    expect(text(fixture)).toContain('base de datos bloqueada');
  });
});
