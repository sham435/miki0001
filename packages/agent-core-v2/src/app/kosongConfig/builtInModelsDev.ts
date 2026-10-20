declare const __MIKI_CODE_BUILT_IN_CATALOG__: string | undefined;

export const BUILT_IN_MODELS_DEV_JSON: string | undefined =
  typeof __MIKI_CODE_BUILT_IN_CATALOG__ === 'string'
    ? __MIKI_CODE_BUILT_IN_CATALOG__
    : undefined;
