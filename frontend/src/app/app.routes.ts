import { Routes } from '@angular/router';
import { Buscar } from './vistas/buscar/buscar';
import { Diccionario } from './vistas/diccionario/diccionario';
import { Ficha } from './vistas/ficha/ficha';
import { Flashcards } from './vistas/flashcards/flashcards';
import { Gramatica } from './vistas/gramatica/gramatica';
import { Traductor } from './vistas/traductor/traductor';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'buscar' },
  { path: 'buscar', component: Buscar, title: 'Buscar — Corpus Damana' },
  { path: 'diccionario', component: Diccionario, title: 'Diccionario — Corpus Damana' },
  { path: 'diccionario/:palabra', component: Ficha, title: 'Palabra — Corpus Damana' },
  { path: 'gramatica', component: Gramatica, title: 'Gramática — Corpus Damana' },
  { path: 'flashcards', component: Flashcards, title: 'Flashcards — Corpus Damana' },
  { path: 'traductor', component: Traductor, title: 'Traductor — Corpus Damana' },
  { path: '**', redirectTo: 'buscar' },
];
