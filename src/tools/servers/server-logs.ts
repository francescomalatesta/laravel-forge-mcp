import { z } from 'zod';

export const serverLogKeyInput = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]*$/)
  .describe(
    'Log to read. Common keys: "nginx-access", "nginx-error", "php" (PHP-FPM of the default version), "mysql", "cron", "daemon"; availability depends on the installed services.',
  );
