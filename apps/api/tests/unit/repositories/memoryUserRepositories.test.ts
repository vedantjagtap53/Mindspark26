import { runUserRepositoryContract } from '../../contract/userRepositoryContract.js';
import { createMemoryUserRepositories } from '../../support/memoryUserRepositories.js';

runUserRepositoryContract('in-memory (test support)', () =>
  Promise.resolve(createMemoryUserRepositories()),
);
