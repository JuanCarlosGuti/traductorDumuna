// Basic Spanish stopwords, already in normalized form (no accents,
// lowercase): 'más'→'mas', 'él'→'el', 'qué'→'que', etc.
const STOPWORDS_ES = new Set([
  'a', 'al', 'algo', 'algunas', 'algunos', 'ante', 'antes', 'como', 'con',
  'contra', 'cual', 'cuando', 'de', 'del', 'desde', 'donde', 'durante',
  'e', 'el', 'ella', 'ellas', 'ellos', 'en', 'entre', 'era', 'eran', 'es',
  'esa', 'esas', 'ese', 'eso', 'esos', 'esta', 'estaba', 'estan', 'estar',
  'estas', 'este', 'esto', 'estos', 'fue', 'fueron', 'ha', 'haber',
  'habia', 'han', 'hasta', 'hay', 'la', 'las', 'le', 'les', 'lo', 'los',
  'mas', 'me', 'mi', 'mis', 'mucho', 'muchos', 'muy', 'nada', 'ni', 'no',
  'nos', 'nosotros', 'nuestra', 'nuestro', 'o', 'os', 'otra', 'otras',
  'otro', 'otros', 'para', 'pero', 'poco', 'por', 'porque', 'que',
  'quien', 'quienes', 'se', 'sea', 'ser', 'si', 'sin', 'sobre', 'son',
  'soy', 'su', 'sus', 'tambien', 'tanto', 'te', 'ti', 'tiene', 'todo',
  'todos', 'tu', 'tus', 'un', 'una', 'uno', 'unos', 'y', 'ya', 'yo',
]);

/**
 * Spanish negations, normalized. Several are also stopwords («no»,
 * «ni», «nada»), but for the translator they count as content: they change the
 * meaning of the sentence and in Damana they are expressed in the verb form.
 */
const NEGACIONES_ES = new Set([
  'no', 'nunca', 'jamas', 'nadie', 'nada', 'ni', 'tampoco', 'ningun',
  'ninguno', 'ninguna', 'ningunos', 'ningunas',
]);

/** Receives the word ALREADY normalized (see normalizar()). */
export function esStopwordEspanol(palabraNormalizada: string): boolean {
  return STOPWORDS_ES.has(palabraNormalizada);
}

/** Receives the word ALREADY normalized (see normalizar()). */
export function esNegacionEspanol(palabraNormalizada: string): boolean {
  return NEGACIONES_ES.has(palabraNormalizada);
}
