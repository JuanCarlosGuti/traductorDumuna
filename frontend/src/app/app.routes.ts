import { Routes } from '@angular/router';
import { sesionIniciada } from './core/auth.guard';
import { Buscar } from './vistas/buscar/buscar';
import { Diccionario } from './vistas/diccionario/diccionario';
import { Entrar } from './vistas/entrar/entrar';
import { Ficha } from './vistas/ficha/ficha';
import { Flashcards } from './vistas/flashcards/flashcards';
import { Gramatica } from './vistas/gramatica/gramatica';
import { Traductor } from './vistas/traductor/traductor';

// Todo pide sesión salvo /entrar. El guard deja pasar igualmente cuando el
// servidor no exige credenciales (desarrollo local).
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
    ],
  },
  { path: '**', redirectTo: 'buscar' },
];
