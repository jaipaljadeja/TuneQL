import { PGlite, PGliteOptions } from '@electric-sql/pglite';
import { worker } from '@electric-sql/pglite/worker';

worker({
  async init(options) {
    return PGlite.create(options as PGliteOptions);
  },
});
