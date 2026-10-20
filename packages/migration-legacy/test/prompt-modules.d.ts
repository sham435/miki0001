// `resume.integration.test.ts` imports real miki-core, which transitively
// imports prompt sources with `?raw`. This ambient declaration lets `tsc`
// type-check the migration package without pulling in miki-core's own `.d.ts`.

declare module '*?raw' {
  const content: string;
  export default content;
}
