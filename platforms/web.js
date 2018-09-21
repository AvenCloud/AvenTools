const fs = require('fs-extra');
const pathJoin = require('path').join;
const spawn = require('@expo/spawn-async');
const { syncAllPackages } = require('./utils');
const yaml = require('js-yaml');

const protoPath = pathJoin(__dirname, '../proto/web');

const sync = async ({ appName, appPkg, location, globeDir }) => {
  await syncAllPackages(globeDir, pathJoin(location, 'src'));

  const serverAppPath = pathJoin(location, 'src/server.js');
  const serverAppFileData = `
    import Server from './${appName}/${appPkg.globe.envOptions.mainServer}';
    
    export default Server;`;
  await fs.writeFile(serverAppPath, serverAppFileData);

  const clientAppPath = pathJoin(location, 'src/client.js');
  const clientAppFileData = `
    import Client from './${appName}/${appPkg.globe.envOptions.mainClient}';
    
    export default Client;`;
  await fs.writeFile(clientAppPath, clientAppFileData);

  const distPkgTemplatePath = pathJoin(location, 'package.template.json');
  const distPkgPath = pathJoin(location, 'package.json');
  const distPkgTemplate = JSON.parse(await fs.readFile(distPkgTemplatePath));
  const distPkg = {
    ...distPkgTemplate,
    dependencies: {
      ...distPkgTemplate.dependencies,
      ...appPkg.dependencies,
    },
  };
  await fs.writeFile(distPkgPath, JSON.stringify(distPkg, null, 2));

  await spawn('yarn', { cwd: location, stdio: 'inherit' });
  return {};
};

const init = async ({ appName, appPkg, location, globeDir }) => {
  await fs.copy(pathJoin(protoPath), location);
  return {};
};

const start = async ({ appName, appPkg, location, globeDir }) => {
  await spawn('yarn', ['start-dev'], { cwd: location, stdio: 'inherit' });
  return {};
};

const deploy = async ({ appName, appPkg, location, globeDir }) => {
  const appYamlPath = pathJoin(location, 'app.yaml');
  const appConfig = yaml.safeLoad(await fs.readFile(appYamlPath));
  const publicConfig = { _configType: 'public' };
  const secretConfig = { _configType: 'secret' };
  if (appPkg && appPkg.globe && appPkg.globe.publicBuildConfigVars) {
    appPkg.globe.publicBuildConfigVars.forEach(varName => {
      publicConfig[varName] = process.env[varName];
    });
  }
  if (appPkg && appPkg.globe && appPkg.globe.secretBuildConfigVars) {
    appPkg.globe.secretBuildConfigVars.forEach(varName => {
      secretConfig[varName] = process.env[varName];
    });
  }
  const newAppConfig = {
    ...appConfig,
    env_variables: {
      ...appConfig.env_variables,
      PUBLIC_CONFIG_JSON: JSON.stringify(publicConfig),
      SECRET_CONFIG_JSON: JSON.stringify(secretConfig),
    },
  };
  if (secretConfig.SQL_INSTANCE_CONNECTION_NAME) {
    newAppConfig.beta_settings = {
      cloud_sql_instances: secretConfig.SQL_INSTANCE_CONNECTION_NAME,
    };
  }
  await fs.writeFile(appYamlPath, yaml.safeDump(newAppConfig));
  await spawn('gcloud', ['app', 'deploy', '-q'], {
    cwd: location,
    stdio: 'inherit',
  });
  return {};
};

const build = async ({ appName, appPkg, location, globeDir }) => {
  await sync({ appName, appPkg, location, globeDir });
  const buildResult = await spawn(
    './node_modules/razzle/bin/razzle.js',
    ['build'],
    {
      cwd: location,
      stdio: 'inherit',
      env: {
        CI: false,
      },
    },
  );
  console.log('Observed buildResult', buildResult);
  const buildLocation = pathJoin(location, 'build');
  return { buildLocation };
};

module.exports = {
  init,
  start,
  sync,
  build,
  deploy,
};
