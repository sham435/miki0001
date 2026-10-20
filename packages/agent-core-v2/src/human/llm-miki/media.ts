import type { ProviderMediaContribution } from '#/llm/media/upload';
import { modelKey, type LlmModel } from '#/llm/model';

import { MikiFiles } from './files';
import { MIKI_DEFAULT_BASE_URL } from './trait';

const filesByModel = new Map<string, MikiFiles>();

function resolveFiles(model: LlmModel): MikiFiles {
  const key = modelKey(model);
  let files = filesByModel.get(key);
  if (files === undefined) {
    files = new MikiFiles({
      apiKey: model.apiKey,
      baseUrl: model.baseUrl ?? MIKI_DEFAULT_BASE_URL,
      defaultHeaders:
        model.defaultHeaders === undefined ? undefined : { ...model.defaultHeaders },
    });
    filesByModel.set(key, files);
  }
  return files;
}

export const mikiMediaContribution: ProviderMediaContribution = {
  uploadVideo: (video, { model, signal }) => resolveFiles(model).uploadVideo(video, { signal }),
};
