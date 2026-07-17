declare module 'virtual:config' {
  const Config: import('astro-pure/types').ConfigOutput
  export default Config
}

// Side-effect CSS / fontsource imports (no bundled type declarations).
declare module '@fontsource-variable/*'
declare module '@fontsource/*'
