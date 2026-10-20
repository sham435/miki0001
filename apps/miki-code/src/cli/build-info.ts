declare const __MIKI_CODE_VERSION__: string | undefined;
declare const __MIKI_CODE_CHANNEL__: string | undefined;
declare const __MIKI_CODE_COMMIT__: string | undefined;
declare const __MIKI_CODE_BUILD_TARGET__: string | undefined;

export interface MikiBuildInfo {
  readonly version?: string;
  readonly channel?: string;
  readonly commit?: string;
  readonly buildTarget?: string;
}

function optionalBuildString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export const MIKI_BUILD_INFO: MikiBuildInfo = {
  version:
    typeof __MIKI_CODE_VERSION__ === 'string'
      ? optionalBuildString(__MIKI_CODE_VERSION__)
      : undefined,
  channel:
    typeof __MIKI_CODE_CHANNEL__ === 'string'
      ? optionalBuildString(__MIKI_CODE_CHANNEL__)
      : undefined,
  commit:
    typeof __MIKI_CODE_COMMIT__ === 'string'
      ? optionalBuildString(__MIKI_CODE_COMMIT__)
      : undefined,
  buildTarget:
    typeof __MIKI_CODE_BUILD_TARGET__ === 'string'
      ? optionalBuildString(__MIKI_CODE_BUILD_TARGET__)
      : undefined,
};
