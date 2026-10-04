import { runRepositoryContract } from '../../contract/repositoryContract.js';
import { createMemoryRepositories } from '../../support/memoryRepositories.js';

runRepositoryContract('in-memory (test support)', () =>
  Promise.resolve(createMemoryRepositories()),
);
