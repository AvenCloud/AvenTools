const fs = require('fs-extra');
const pathJoin = require('path').join;
const spawn = require('@expo/spawn-async');
const yaml = require('js-yaml');

const protoPath = pathJoin(__dirname, '../proto/web');

const getPackageSourceDir = location => pathJoin(location, 'src', 'sync');

const getTemplatePkg = async () => {
  const pkgPath = pathJoin(protoPath, 'package.template.json');
  const pkg = JSON.parse(await fs.readFile(pkgPath));
  return pkg;
};

const applyPackage = async ({ location, appName, appPkg, distPkg }) => {
  const serverAppPath = pathJoin(location, 'src', 'server.js');
  const serverAppFileData = `
import Server from './sync/${appName}/${appPkg.globe.envOptions.mainServer}';

export default Server;
`;
  await fs.writeFile(serverAppPath, serverAppFileData);

  const clientAppPath = pathJoin(location, 'src', 'client.js');
  const clientAppFileData = `
import startClient from './sync/${appName}/${
    appPkg.globe.envOptions.mainClient
  }';

startClient();
`;
  await fs.writeFile(clientAppPath, clientAppFileData);

  const distPkgPath = pathJoin(location, 'package.json');
  await fs.writeFile(distPkgPath, JSON.stringify(distPkg, null, 2));

  await spawn('yarn', { cwd: location, stdio: 'inherit' });
};

const init = async ({ location }) => {
  await fs.copy(pathJoin(protoPath), location);
  return {};
};

const start = async ({ location }) => {
  await spawn('yarn', ['start-dev'], { cwd: location, stdio: 'inherit' });
  return {};
};

const deploy = async ({ appName, appPkg, location, globeDir }) => {
  // this part isn't so generalized.. the app.yaml and secret serialization is all GAE specific
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
  const razzleLocation = pathJoin(
    location,
    'node_modules/razzle/bin/razzle.js',
  );
  const buildResult = await spawn(razzleLocation, ['build'], {
    cwd: location,
    stdio: 'inherit',
    env: {
      ...process.env,
      CI: false, // when CI is true, every warning is a build failure!
    },
  });
  const buildLocation = pathJoin(location, 'build');
  return { buildLocation };
};

module.exports = {
  getPackageSourceDir,
  getTemplatePkg,
  applyPackage,

  init,
  start,
  build,
  deploy,
};
