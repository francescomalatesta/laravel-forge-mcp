/**
 * Builds an API path, URL-encoding every interpolated segment:
 * apiPath`/orgs/${org}/servers/${id}`.
 */
export function apiPath(strings: TemplateStringsArray, ...segments: (string | number)[]): string {
  return strings.reduce((path, part, index) => {
    const segment = segments[index];
    return path + part + (segment === undefined ? '' : encodeURIComponent(String(segment)));
  }, '');
}
