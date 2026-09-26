// Paths of the spelling dictionaries (scripts/spell-dictionaries.mjs), without
// the ".aff.txt" / ".dic.txt" extension.
declare module 'virtual:spell-dictionaries' {
  const paths: Record<'es' | 'gl' | 'en' | 'fr' | 'de', string>
  export default paths
}
