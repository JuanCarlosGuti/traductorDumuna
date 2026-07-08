import { Routes } from '@angular/router';
import { Buscar } from './vistas/buscar/buscar';
import { Diccionario } from './vistas/diccionario/diccionario';
import { Ficha } from './vistas/ficha/ficha';
import { Flashcards } from './vistas/flashcards/flashcards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'buscar' },
  { path: 'buscar', component: Buscar, title: 'Buscar — Corpus Damana' },
  { path: 'diccionario', component: Diccionario, title: 'Diccionario — Corpus Damana' },
  { path: 'diccionario/:palabra', component: Ficha, title: 'Palabra — Corpus Damana' },
  { path: 'flashcards', component: Flashcards, title: 'Flashcards — Corpus Damana' },
  { path: '**', redirectTo: 'buscar' },
];
