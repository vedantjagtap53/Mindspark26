// Activity log: what happens to accounts (sign-up, sign-in, role changes) and when a run is saved.
// The admin console reads it. It is operational history, not audit evidence (the saved runs are),
// so recording is best effort: a failure is logged and never breaks the sign-in or run it describes.
import type { ActivityEventInput, Repositories } from '../../repositories/interfaces/index.js';
import type { Logger } from '../../utils/logger.js';

export interface ActivityLog {
  record(input: ActivityEventInput): Promise<void>;
}

export function createActivityLog(
  repositories: Repositories | undefined,
  logger: Logger,
): ActivityLog {
  return {
    async record(input) {
      if (!repositories) return;
      try {
        await repositories.activity.record(input);
      } catch (err) {
        logger.error('Could not record an activity event', {
          event: input.event,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}
