import yaml from 'js-yaml';
import fs from 'fs';

export class AppSettingsError extends Error {
  constructor(msg) {
    super(`[AppSettings] ${msg}`);
  }
}

export function validateYaml(yamlData) {
  if (!(yamlData instanceof Array)) {
    throw new AppSettingsError('App settings should be an array');
  }

  const dbAppIds = new Set();
  const headerAppSecrets = new Set();
  yamlData.forEach((appSetting, idx) => {
    // Check dbAppId
    //
    if (!appSetting.dbAppId)
      throw new AppSettingsError(`App setting ${idx} does not have dbAppId`);
    if (dbAppIds.has(appSetting.dbAppId))
      throw new AppSettingsError(`App setting ${idx} has duplicated dbAppId`);
    dbAppIds.add(appSetting.dbAppId);

    // Check headerAppSecrets
    //
    if (!(appSetting.headerAppSecrets instanceof Array))
      throw new AppSettingsError(
        `App setting ${idx} does not have headerAppSecrets array`
      );
    appSetting.headerAppSecrets.forEach(secret => {
      if (typeof secret !== 'string')
        throw new AppSettingsError(
          `App ${appSetting.dbAppId} has invalid secret`
        );
      if (headerAppSecrets.has(secret))
        throw new AppSettingsError(
          `App ${appSetting.dbAppId} has duplicated secret`
        );
      headerAppSecrets.add(secret);
    });
  });
}

export function loadAppSettings(path = process.env.APP_SETTINGS_PATH) {
  if (!path) throw new AppSettingsError('APP_SETTINGS_PATH is not specified');
  try {
    const yamlData = yaml.load(fs.readFileSync(path));
    validateYaml(yamlData);
    return yamlData;
  } catch (e) {
    console.error(e);
    return [];
  }
}
