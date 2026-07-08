// Stopwords españolas básicas, ya en forma normalizada (sin tildes,
// minúsculas): 'más'→'mas', 'él'→'el', 'qué'→'que', etc.
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

/** Recibe la palabra YA normalizada (ver normalizar()). */
export function esStopwordEspanol(palabraNormalizada: string): boolean {
  return STOPWORDS_ES.has(palabraNormalizada);
}
