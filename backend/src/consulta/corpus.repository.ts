import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { DB_CONNECTION } from '../database/database.constants';
import { CorpusDomain, CorpusSource } from './consulta.enums';
import {
  ConjugationDto,
  PhraseDto,
  LemmaDto,
  ProperNameDto,
  VocabularyDto,
} from './dto/consulta.dto';
import { Trigger, GrammarRule } from './reglas';

export interface TextRow {
  id: number;
  referencia: string;
  textoDamana: string;
  textoEspanol: string;
  /** Sentences only: 'aprobado' | 'revisar' (alignment quality). */
  estado?: string;
  /** Language register of the fragment (biblical, everyday, grammar). */
  dominio: CorpusDomain;
}

export interface WordFrequency {
  palabra: string;
  frecuencia: number;
  originales: string[];
}

@Injectable()
export class CorpusRepository {
  constructor(@Inject(DB_CONNECTION) private readonly db: Database) {}

  listVocabulary(): VocabularyDto[] {
    return this.db
      .prepare(
        'SELECT rowid AS id, espanol, damana, categoria, notas, fuente FROM vocabulario ORDER BY rowid',
      )
      .all() as VocabularyDto[];
  }

  listPhrases(): PhraseDto[] {
    return this.db
      .prepare(
        'SELECT rowid AS id, fuente, damana, espanol, notas, dominio FROM frases ORDER BY rowid',
      )
      .all() as PhraseDto[];
  }

  /** Grammar rules from reglas_damana.xlsx, with their trigger. */
  listRules(): GrammarRule[] {
    return (
      this.db
        .prepare(
          `SELECT rowid AS id, tipo, forma, significado, ejemplo_base, ejemplo_regla,
                  traduccion_ejemplo, notas, disparador
           FROM reglas ORDER BY rowid`,
        )
        .all() as any[]
    ).map((f) => ({
      id: f.id,
      tipo: f.tipo,
      forma: f.forma,
      significado: f.significado,
      ejemploBase: f.ejemplo_base,
      ejemploRegla: f.ejemplo_regla,
      traduccionEjemplo: f.traduccion_ejemplo,
      notas: f.notas,
      disparador: (f.disparador as Trigger | null) ?? null,
    }));
  }

  listProperNames(): ProperNameDto[] {
    return (
      this.db
        .prepare(
          `SELECT rowid AS id, damana, espanol, se_escribe_igual, otras_grafias, notas
           FROM nombres_propios ORDER BY rowid`,
        )
        .all() as any[]
    ).map((f) => ({
      id: f.id,
      damana: f.damana,
      espanol: f.espanol,
      seEscribeIgual: f.se_escribe_igual === 1,
      otrasGrafias: f.otras_grafias
        ? String(f.otras_grafias)
            .split(/[,;]/)
            .map((g: string) => g.trim())
            .filter(Boolean)
        : [],
      notas: f.notas,
    }));
  }

  /** Verb lemmas with their number of conjugated forms. */
  listLemmas(): LemmaDto[] {
    return this.db
      .prepare(
        'SELECT lema, COUNT(*) AS formas FROM conjugaciones GROUP BY lema ORDER BY lema',
      )
      .all() as LemmaDto[];
  }

  /** Conjugations whose Damana form contains the word (via tokens). */
  conjugationsWithWord(normalizedWord: string): ConjugationDto[] {
    return this.db
      .prepare(
        `SELECT DISTINCT c.rowid AS id, c.damana, c.espanol, c.lema, c.fuente, c.notas
         FROM conjugaciones c
         JOIN tokens_damana t
           ON t.tabla_origen = 'conjugaciones' AND t.id_origen = c.rowid
         WHERE t.palabra_normalizada = ?
         ORDER BY c.lema, c.rowid`,
      )
      .all(normalizedWord) as ConjugationDto[];
  }

  /**
   * Conjugated forms grouped by lemma, to link together the
   * different persons of the same verb (nʉjkasheshisha / naijkasheshisha…).
   */
  formsByLemma(): { lema: string; damana: string }[] {
    return this.db
      .prepare('SELECT lema, damana FROM conjugaciones ORDER BY lema, rowid')
      .all() as { lema: string; damana: string }[];
  }

  listConjugations(): ConjugationDto[] {
    return this.db
      .prepare(
        'SELECT rowid AS id, damana, espanol, lema, fuente, notas FROM conjugaciones ORDER BY rowid',
      )
      .all() as ConjugationDto[];
  }

  conjugationsOf(lemma: string): ConjugationDto[] {
    return this.db
      .prepare(
        `SELECT rowid AS id, damana, espanol, lema, fuente, notas
         FROM conjugaciones WHERE lema = ? ORDER BY rowid`,
      )
      .all(lemma) as ConjugationDto[];
  }

  /**
   * Rows from a source with their Damana and Spanish text already assembled for
   * concordance and retrieval. In sentences the reference marks those with
   * doubtful alignment with «(revisar)».
   */
  textsOf(source: CorpusSource): TextRow[] {
    switch (source) {
      case CorpusSource.oraciones:
        return (
          this.db
            .prepare(
              'SELECT rowid AS id, damana, espanol, estado, dominio FROM oraciones ORDER BY rowid',
            )
            .all() as any[]
        ).map((f) => ({
          id: f.id,
          referencia: f.estado === 'revisar' ? `oración ${f.id} (revisar)` : `oración ${f.id}`,
          textoDamana: f.damana,
          textoEspanol: f.espanol ?? '',
          estado: f.estado,
          dominio: f.dominio as CorpusDomain,
        }));
      case CorpusSource.frases:
        return (
          this.db
            .prepare(
              'SELECT rowid AS id, fuente, damana, espanol, dominio FROM frases ORDER BY rowid',
            )
            .all() as any[]
        ).map((f) => ({
          id: f.id,
          referencia: f.fuente ? `frase ${f.id} (${f.fuente})` : `frase ${f.id}`,
          textoDamana: f.damana,
          textoEspanol: f.espanol ?? '',
          dominio: f.dominio as CorpusDomain,
        }));
      case CorpusSource.vocabulario:
        return (
          this.db
            .prepare('SELECT rowid AS id, espanol, damana FROM vocabulario ORDER BY rowid')
            .all() as any[]
        ).map((f) => ({
          id: f.id,
          referencia: `vocabulario ${f.id}`,
          textoDamana: f.damana,
          textoEspanol: f.espanol,
          dominio: CorpusDomain.cotidiano,
        }));
      case CorpusSource.conjugaciones:
        return (
          this.db
            .prepare('SELECT rowid AS id, damana, espanol, lema FROM conjugaciones ORDER BY rowid')
            .all() as any[]
        ).map((f) => ({
          id: f.id,
          referencia: `conjugación ${f.id} (${f.lema})`,
          textoDamana: f.damana,
          textoEspanol: f.espanol,
          dominio: CorpusDomain.gramatica,
        }));
    }
  }

  frequencyBySource(
    normalizedWord: string,
  ): { fuente: CorpusSource; frecuencia: number }[] {
    return this.db
      .prepare(
        `SELECT tabla_origen AS fuente, COUNT(*) AS frecuencia
         FROM tokens_damana WHERE palabra_normalizada = ?
         GROUP BY tabla_origen ORDER BY tabla_origen`,
      )
      .all(normalizedWord) as { fuente: CorpusSource; frecuencia: number }[];
  }

  originsOf(
    normalizedWord: string,
  ): { fuente: CorpusSource; id: number }[] {
    return this.db
      .prepare(
        `SELECT DISTINCT tabla_origen AS fuente, id_origen AS id
         FROM tokens_damana WHERE palabra_normalizada = ?`,
      )
      .all(normalizedWord) as { fuente: CorpusSource; id: number }[];
  }

  spanishTextOf(source: CorpusSource, id: number): string {
    const column: Record<CorpusSource, string> = {
      [CorpusSource.oraciones]: 'oraciones',
      [CorpusSource.frases]: 'frases',
      [CorpusSource.vocabulario]: 'vocabulario',
      [CorpusSource.conjugaciones]: 'conjugaciones',
    };
    const row = this.db
      .prepare(`SELECT espanol FROM ${column[source]} WHERE rowid = ?`)
      .get(id) as { espanol: string | null } | undefined;
    return row?.espanol ?? '';
  }

  /**
   * All Damana words with their total frequency and the distinct
   * original forms in which they appear (for the proper-name
   * heuristic). The ',' separator is safe: the tokenizer never produces
   * commas inside a word.
   */
  frequenciesWithOriginals(): WordFrequency[] {
    return (
      this.db
        .prepare(
          `SELECT palabra_normalizada AS palabra, COUNT(*) AS frecuencia,
                  GROUP_CONCAT(DISTINCT palabra_original) AS originales
           FROM tokens_damana
           GROUP BY palabra_normalizada
           ORDER BY frecuencia DESC, palabra`,
        )
        .all() as any[]
    ).map((f) => ({
      palabra: f.palabra,
      frecuencia: f.frecuencia,
      originales: (f.originales as string).split(','),
    }));
  }
}
