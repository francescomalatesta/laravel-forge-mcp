import { z } from 'zod';

/** Site logs; each value is also the endpoint path segment (`/logs/<log>`). */
export const siteLogInput = z
  .enum(['application', 'nginx-access', 'nginx-error'])
  .default('application')
  .describe('"application": the app log (e.g. storage/logs/laravel.log); "nginx-access" / "nginx-error": the site\'s Nginx logs.');
