for (const key of Object.keys(process.env)) {
  if (key.startsWith('MIKI_CODE_')) {
    delete process.env[key];
  }
}

process.env['MIKI_CODE_SEARCH_WORKER'] = 'false';

process.env['MIKI_CODE_PERSISTENCE_MINIDB_READMODEL'] = 'false';
