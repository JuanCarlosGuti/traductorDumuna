import { Routes } from '@angular/router';
import { sessionStarted } from './core/auth.guard';
import { SearchView } from './views/search/search';
import { DictionaryView } from './views/dictionary/dictionary';
import { LoginView } from './views/login/login';
import { WordCardView } from './views/word-card/word-card';
import { Flashcards } from './views/flashcards/flashcards';
import { GrammarView } from './views/grammar/grammar';
import { PendingView } from './views/pending/pending';
import { TranslatorView } from './views/translator/translator';

// Everything requires a session except /entrar. The guard still lets through when the
// server does not require credentials (local development).
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'buscar' },
  { path: 'entrar', component: LoginView, title: 'Entrar — Corpus Damana' },
  {
    path: '',
    canActivateChild: [sessionStarted],
    children: [
      { path: 'buscar', component: SearchView, title: 'Buscar — Corpus Damana' },
      { path: 'diccionario', component: DictionaryView, title: 'Diccionario — Corpus Damana' },
      { path: 'diccionario/:word', component: WordCardView, title: 'Palabra — Corpus Damana' },
      { path: 'gramatica', component: GrammarView, title: 'Gramática — Corpus Damana' },
      { path: 'flashcards', component: Flashcards, title: 'Flashcards — Corpus Damana' },
      { path: 'traductor', component: TranslatorView, title: 'Traductor — Corpus Damana' },
      { path: 'pendientes', component: PendingView, title: 'Pendientes — Corpus Damana' },
    ],
  },
  { path: '**', redirectTo: 'buscar' },
];
