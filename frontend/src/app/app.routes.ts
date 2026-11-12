import { Routes } from '@angular/router';
import { sesionIniciada } from './core/auth.guard';
import { Buscar } from './vistas/buscar/buscar';
import { Diccionario } from './vistas/diccionario/diccionario';
import { Entrar } from './vistas/entrar/entrar';
import { Ficha } from './vistas/ficha/ficha';
import { Flashcards } from './vistas/flashcards/flashcards';
import { Gramatica } from './vistas/gramatica/gramatica';
import { Pendientes } from './vistas/pendientes/pendientes';
import { Traductor } from './vistas/traductor/traductor';

// Everything requires a session except /entrar. The guard still lets through when the
// server does not require credentials (local development).
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'buscar' },
  { path: 'entrar', component: Entrar, title: 'Entrar — Corpus Damana' },
  {
    path: '',
    canActivateChild: [sesionIniciada],
    children: [
      { path: 'buscar', component: Buscar, title: 'Buscar — Corpus Damana' },
      { path: 'diccionario', component: Diccionario, title: 'Diccionario — Corpus Damana' },
      { path: 'diccionario/:palabra', component: Ficha, title: 'Palabra — Corpus Damana' },
      { path: 'gramatica', component: Gramatica, title: 'Gramática — Corpus Damana' },
      { path: 'flashcards', component: Flashcards, title: 'Flashcards — Corpus Damana' },
      { path: 'traductor', component: Traductor, title: 'Traductor — Corpus Damana' },
      { path: 'pendientes', component: Pendientes, title: 'Pendientes — Corpus Damana' },
    ],
  },
  { path: '**', redirectTo: 'buscar' },
];
