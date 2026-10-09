import type { Config } from '../config.js';
import type { AnyToolDefinition } from './define-tool.js';
import { createDeployKey } from './deployments/create-deploy-key.js';
import { createDeploymentWebhook } from './deployments/create-deployment-webhook.js';
import { deleteDeployKey } from './deployments/delete-deploy-key.js';
import { deleteDeploymentWebhook } from './deployments/delete-deployment-webhook.js';
import { deploySite } from './deployments/deploy-site.js';
import { getDeployHook } from './deployments/get-deploy-hook.js';
import { getDeployKey } from './deployments/get-deploy-key.js';
import { getDeployment } from './deployments/get-deployment.js';
import { getDeploymentScript } from './deployments/get-deployment-script.js';
import { getDeploymentStatus } from './deployments/get-deployment-status.js';
import { listDeploymentWebhooks } from './deployments/list-deployment-webhooks.js';
import { listDeployments } from './deployments/list-deployments.js';
import { regenerateDeployHook } from './deployments/regenerate-deploy-hook.js';
import { resetDeploymentState } from './deployments/reset-deployment-state.js';
import { setPushToDeploy } from './deployments/set-push-to-deploy.js';
import { updateDeploymentScript } from './deployments/update-deployment-script.js';
import { getServerEvent } from './events/get-server-event.js';
import { listServerEvents } from './events/list-server-events.js';
import { listOrganizations } from './organizations/list-organizations.js';
import { getServer } from './servers/get-server.js';
import { listServers } from './servers/list-servers.js';
import { clearSiteLog } from './sites/clear-site-log.js';
import { createBalancedSite } from './sites/create-balanced-site.js';
import { createSite } from './sites/create-site.js';
import { deleteSite } from './sites/delete-site.js';
import { getSiteEnvironment } from './sites/get-site-environment.js';
import { getSiteHealthcheck } from './sites/get-site-healthcheck.js';
import { getSiteLog } from './sites/get-site-log.js';
import { getSiteNginxConfig } from './sites/get-site-nginx-config.js';
import { getSite } from './sites/get-site.js';
import { listSites } from './sites/list-sites.js';
import { setSiteEnvVars } from './sites/set-site-env-vars.js';
import { updateSite } from './sites/update-site.js';
import { updateSiteEnvironment } from './sites/update-site-environment.js';
import { updateSiteHealthcheck } from './sites/update-site-healthcheck.js';
import { updateSiteNginxConfig } from './sites/update-site-nginx-config.js';
import { updateSiteRepository } from './sites/update-site-repository.js';

/** Every tool shipped by the server. Add new tools here. */
export const ALL_TOOLS: readonly AnyToolDefinition[] = [
  // core
  listOrganizations,
  listServers,
  getServer,
  listSites,
  getSite,
  listServerEvents,
  getServerEvent,
  // sites
  createSite,
  createBalancedSite,
  updateSite,
  updateSiteRepository,
  deleteSite,
  setSiteEnvVars,
  getSiteEnvironment,
  updateSiteEnvironment,
  getSiteNginxConfig,
  updateSiteNginxConfig,
  getSiteLog,
  clearSiteLog,
  getSiteHealthcheck,
  updateSiteHealthcheck,
  // deployments
  listDeployments,
  getDeployment,
  getDeploymentStatus,
  deploySite,
  resetDeploymentState,
  getDeploymentScript,
  updateDeploymentScript,
  getDeployHook,
  regenerateDeployHook,
  setPushToDeploy,
  listDeploymentWebhooks,
  createDeploymentWebhook,
  deleteDeploymentWebhook,
  getDeployKey,
  createDeployKey,
  deleteDeployKey,
];

/** Tools enabled by the configuration (toolsets, read-only mode, secrets opt-in). */
export function selectTools(
  config: Pick<Config, 'toolsets' | 'readOnly' | 'allowSecrets'>,
  tools: readonly AnyToolDefinition[] = ALL_TOOLS,
): AnyToolDefinition[] {
  return tools.filter(
    (tool) =>
      config.toolsets.has(tool.toolset) &&
      (!config.readOnly || tool.readOnly) &&
      (config.allowSecrets || !tool.exposesSecrets),
  );
}
