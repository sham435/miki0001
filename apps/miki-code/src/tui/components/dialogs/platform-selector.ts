import { OPEN_PLATFORMS } from '@mymoon-ai/miki-code-oauth';

import { MIKI_CODE_GLOBAL_PLATFORM_VALUE } from '#/utils/region';

import { ChoicePickerComponent, type ChoiceOption } from './choice-picker';

const MIKI_CODE_MAINLAND_CN_OPTION: ChoiceOption = {
  value: 'miki-code',
  label: 'Miki Code (miki.com/code)',
};
const MIKI_CODE_GLOBAL_OPTION: ChoiceOption = {
  value: MIKI_CODE_GLOBAL_PLATFORM_VALUE,
  label: 'Miki Code (miki.ai/code)',
};

function platformOptions(): readonly ChoiceOption[] {
  return [
    MIKI_CODE_MAINLAND_CN_OPTION,
    MIKI_CODE_GLOBAL_OPTION,
    ...OPEN_PLATFORMS.map((platform) => ({ value: platform.id, label: platform.name })),
  ];
}

export interface PlatformSelectorOptions {
  readonly onSelect: (platformId: string) => void;
  readonly onCancel: () => void;
}

export class PlatformSelectorComponent extends ChoicePickerComponent {
  constructor(opts: PlatformSelectorOptions) {
    super({
      title: 'Select a platform',
      options: [...platformOptions()],
      onSelect: opts.onSelect,
      onCancel: opts.onCancel,
    });
  }
}
