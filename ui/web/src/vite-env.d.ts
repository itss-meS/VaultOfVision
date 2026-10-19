interface ImportMetaEnv {
  readonly VITE_ENGINE?: 'http' | 'native';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
