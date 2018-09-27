const fs = require('fs-extra');
const pathJoin = require('path').join;
const spawn = require('@expo/spawn-async');
const { syncAllPackages, syncPackage } = require('./utils');
const yaml = require('js-yaml');

const protoPath = pathJoin(__dirname, '../proto/web');

const getAllGlobeDependencies = async (globeDir, packageName) => {
  const packageDir = pathJoin(globeDir, packageName);
  const packageJSONPath = pathJoin(packageDir, 'package.json');
  const pkgJSON = JSON.parse(await fs.readFile(packageJSONPath));
  const pkgDeps = (pkgJSON.globe && pkgJSON.globe.globeDependencies) || [];
  const childPkgDeps = await Promise.all(
    pkgDeps.map(async pkgDep => {
      return await getAllGlobeDependencies(globeDir, pkgDep);
    }),
  );
  const allPkgDeps = new Set(pkgDeps);
  allPkgDeps.add(packageName);
  childPkgDeps.forEach(cPkgDeps =>
    cPkgDeps.forEach(cPkgDep => allPkgDeps.add(cPkgDep)),
  );
  return allPkgDeps;
};

const getAllModuleDependencies = async (globeDir, packageName) => {
  const packageDir = pathJoin(globeDir, packageName);
  const packageJSONPath = pathJoin(packageDir, 'package.json');
  const pkgJSON = JSON.parse(await fs.readFile(packageJSONPath));
  const pkgDeps = (pkgJSON.globe && pkgJSON.globe.globeDependencies) || [];
  const moduleDeps = (pkgJSON.globe && pkgJSON.globe.moduleDependencies) || [];
  const childPkgDeps = await Promise.all(
    pkgDeps.map(async pkgDep => {
      return await getAllModuleDependencies(globeDir, pkgDep);
    }),
  );
  const allModuleDeps = new Set(moduleDeps);
  childPkgDeps.forEach(cPkgDeps =>
    cPkgDeps.forEach(cPkgDep => allModuleDeps.add(cPkgDep)),
  );
  return allModuleDeps;
};

// packageSourceDir = (location) => pathJoin(location, 'src', 'sync');

const sync = async ({ appName, appPkg, location, globeDir }) => {
  const packageSourceDir = pathJoin(location, 'src', 'sync');
  await fs.mkdirp(packageSourceDir);
  const existingDirs = await fs.readdir(packageSourceDir);

  const allGlobeDeps = await getAllGlobeDependencies(globeDir, appName);
  await Promise.all(
    existingDirs
      .filter(testPkgName => !allGlobeDeps.has(testPkgName))
      .map(async pkgToRemove => {
        const pkgToRemovePath = pathJoin(packageSourceDir, pkgToRemove);
        await fs.remove(pkgToRemovePath);
      }),
  );
  await Promise.all(
    Array.from(allGlobeDeps).map(async globeDep => {
      await syncPackage(globeDep, globeDir, packageSourceDir);
    }),
  );

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
  const globePkg = JSON.parse(
    await fs.readFile(pathJoin(globeDir, 'package.json')),
  );
  Array.from(await getAllModuleDependencies(globeDir, appName)).forEach(
    moduleDep => {
      if (globePkg.dependencies[moduleDep] == null) {
        throw new Error(
          `Cannot find dependency "${moduleDep}" inside package.json for globe at ${globeDir}`,
        );
      }
      distPkg.dependencies[moduleDep] = globePkg.dependencies[moduleDep];
    },
  );
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
