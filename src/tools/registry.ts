import type { Config } from '../config.js';
import type { AnyToolDefinition } from './define-tool.js';
import { createBackgroundProcess } from './background-processes/create-background-process.js';
import { deleteBackgroundProcess } from './background-processes/delete-background-process.js';
import { getBackgroundProcessLog } from './background-processes/get-background-process-log.js';
import { listBackgroundProcesses } from './background-processes/list-background-processes.js';
import { runBackgroundProcessAction } from './background-processes/run-background-process-action.js';
import { updateBackgroundProcess } from './background-processes/update-background-process.js';
import { createBackup } from './backups/create-backup.js';
import { createBackupConfiguration } from './backups/create-backup-configuration.js';
import { deleteBackup } from './backups/delete-backup.js';
import { deleteBackupConfiguration } from './backups/delete-backup-configuration.js';
import { listBackupConfigurations } from './backups/list-backup-configurations.js';
import { listBackups } from './backups/list-backups.js';
import { restoreBackup } from './backups/restore-backup.js';
import { updateBackupConfiguration } from './backups/update-backup-configuration.js';
import { createCertificate } from './certificates/create-certificate.js';
import { deleteCertificate } from './certificates/delete-certificate.js';
import { getCertificate } from './certificates/get-certificate.js';
import { listCertificates } from './certificates/list-certificates.js';
import { runCertificateAction } from './certificates/run-certificate-action.js';
import { deleteSiteCommand } from './commands/delete-site-command.js';
import { getSiteCommand } from './commands/get-site-command.js';
import { listSiteCommands } from './commands/list-site-commands.js';
import { runSiteCommand } from './commands/run-site-command.js';
import { createDatabase } from './databases/create-database.js';
import { createDatabaseUser } from './databases/create-database-user.js';
import { deleteDatabase } from './databases/delete-database.js';
import { deleteDatabaseUser } from './databases/delete-database-user.js';
import { listDatabaseUsers } from './databases/list-database-users.js';
import { listDatabases } from './databases/list-databases.js';
import { syncDatabases } from './databases/sync-databases.js';
import { updateDatabaseRootPassword } from './databases/update-database-root-password.js';
import { updateDatabaseUser } from './databases/update-database-user.js';
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
import { addDomain } from './domains/add-domain.js';
import { deleteDomain } from './domains/delete-domain.js';
import { getDomain } from './domains/get-domain.js';
import { listDomains } from './domains/list-domains.js';
import { runDomainAction } from './domains/run-domain-action.js';
import { updateDomain } from './domains/update-domain.js';
import { getServerEvent } from './events/get-server-event.js';
import { listServerEvents } from './events/list-server-events.js';
import { createFirewallRule } from './firewall/create-firewall-rule.js';
import { deleteFirewallRule } from './firewall/delete-firewall-rule.js';
import { listFirewallRules } from './firewall/list-firewall-rules.js';
import { disableSiteIntegration } from './integrations/disable-site-integration.js';
import { enableSiteIntegration } from './integrations/enable-site-integration.js';
import { getSiteIntegrations } from './integrations/get-site-integrations.js';
import { listOrganizations } from './organizations/list-organizations.js';
import { getPhpConfig } from './php/get-php-config.js';
import { getPhpSettings } from './php/get-php-settings.js';
import { installPhpVersion } from './php/install-php-version.js';
import { listPhpVersions } from './php/list-php-versions.js';
import { setDefaultPhpVersion } from './php/set-default-php-version.js';
import { setPhpOpcache } from './php/set-php-opcache.js';
import { uninstallPhpVersion } from './php/uninstall-php-version.js';
import { updatePhpConfig } from './php/update-php-config.js';
import { updatePhpLimits } from './php/update-php-limits.js';
import { upgradePhpVersion } from './php/upgrade-php-version.js';
import { createRedirectRule } from './redirects/create-redirect-rule.js';
import { deleteRedirectRule } from './redirects/delete-redirect-rule.js';
import { exportRedirectRules } from './redirects/export-redirect-rules.js';
import { importRedirectRules } from './redirects/import-redirect-rules.js';
import { listRedirectRules } from './redirects/list-redirect-rules.js';
import { reorderRedirectRules } from './redirects/reorder-redirect-rules.js';
import { createScheduledJob } from './scheduled-jobs/create-scheduled-job.js';
import { deleteScheduledJob } from './scheduled-jobs/delete-scheduled-job.js';
import { getScheduledJob } from './scheduled-jobs/get-scheduled-job.js';
import { listScheduledJobs } from './scheduled-jobs/list-scheduled-jobs.js';
import { createSecurityRule } from './security-rules/create-security-rule.js';
import { deleteSecurityRule } from './security-rules/delete-security-rule.js';
import { listSecurityRules } from './security-rules/list-security-rules.js';
import { updateSecurityRule } from './security-rules/update-security-rule.js';
import { archiveServer } from './servers/archive-server.js';
import { clearServerLog } from './servers/clear-server-log.js';
import { deleteServer } from './servers/delete-server.js';
import { getServer } from './servers/get-server.js';
import { getServerLog } from './servers/get-server-log.js';
import { getServerNetwork } from './servers/get-server-network.js';
import { listArchivedServers } from './servers/list-archived-servers.js';
import { listServers } from './servers/list-servers.js';
import { runServerAction } from './servers/run-server-action.js';
import { runServiceAction } from './servers/run-service-action.js';
import { unarchiveServer } from './servers/unarchive-server.js';
import { updateServer } from './servers/update-server.js';
import { updateServerNetwork } from './servers/update-server-network.js';
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
import { addSshKey } from './ssh-keys/add-ssh-key.js';
import { deleteSshKey } from './ssh-keys/delete-ssh-key.js';
import { getServerPublicKey } from './ssh-keys/get-server-public-key.js';
import { listSshKeys } from './ssh-keys/list-ssh-keys.js';
import { regenerateServerKey } from './ssh-keys/regenerate-server-key.js';
import { createStorageProvider } from './storage/create-storage-provider.js';
import { deleteStorageProvider } from './storage/delete-storage-provider.js';
import { listStorageProviders } from './storage/list-storage-providers.js';
import { updateStorageProvider } from './storage/update-storage-provider.js';

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
  // sites: domains and certificates
  listDomains,
  getDomain,
  addDomain,
  updateDomain,
  runDomainAction,
  deleteDomain,
  listCertificates,
  getCertificate,
  createCertificate,
  runCertificateAction,
  deleteCertificate,
  // servers
  runServiceAction,
  runServerAction,
  getServerLog,
  clearServerLog,
  updateServer,
  getServerNetwork,
  updateServerNetwork,
  listArchivedServers,
  archiveServer,
  unarchiveServer,
  deleteServer,
  // servers: PHP
  listPhpVersions,
  getPhpSettings,
  installPhpVersion,
  upgradePhpVersion,
  uninstallPhpVersion,
  setDefaultPhpVersion,
  updatePhpLimits,
  setPhpOpcache,
  getPhpConfig,
  updatePhpConfig,
  // databases
  listDatabases,
  createDatabase,
  deleteDatabase,
  syncDatabases,
  listDatabaseUsers,
  createDatabaseUser,
  updateDatabaseUser,
  deleteDatabaseUser,
  updateDatabaseRootPassword,
  // databases: backups
  listBackupConfigurations,
  createBackupConfiguration,
  updateBackupConfiguration,
  deleteBackupConfiguration,
  listBackups,
  createBackup,
  deleteBackup,
  restoreBackup,
  // storage
  listStorageProviders,
  createStorageProvider,
  updateStorageProvider,
  deleteStorageProvider,
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
  // jobs
  listScheduledJobs,
  getScheduledJob,
  createScheduledJob,
  deleteScheduledJob,
  listBackgroundProcesses,
  getBackgroundProcessLog,
  createBackgroundProcess,
  updateBackgroundProcess,
  runBackgroundProcessAction,
  deleteBackgroundProcess,
  // security
  listFirewallRules,
  createFirewallRule,
  deleteFirewallRule,
  listSecurityRules,
  createSecurityRule,
  updateSecurityRule,
  deleteSecurityRule,
  listRedirectRules,
  createRedirectRule,
  deleteRedirectRule,
  reorderRedirectRules,
  exportRedirectRules,
  importRedirectRules,
  listSshKeys,
  addSshKey,
  deleteSshKey,
  getServerPublicKey,
  regenerateServerKey,
  // integrations
  getSiteIntegrations,
  enableSiteIntegration,
  disableSiteIntegration,
  // commands
  runSiteCommand,
  listSiteCommands,
  getSiteCommand,
  deleteSiteCommand,
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
