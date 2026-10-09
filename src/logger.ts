/**
 * Logs to stderr: with the stdio transport, stdout is reserved for protocol messages.
 */
export const logger = {
  info: (message: string) => write('info', message),
  warn: (message: string) => write('warn', message),
  error: (message: string) => write('error', message),
};

function write(level: string, message: string): void {
  process.stderr.write(`[laravel-forge-mcp] ${level}: ${message}\n`);
}
