const pathJoin = require('path').join;
const fs = require('fs-extra');
const uuid = require('uuid/v1');
const sane = require('sane');
const homeDir = require('os').homedir();

const globeDir = process.cwd();
const globeHomeDir = pathJoin(homeDir, '.globe');
const globeStatePath = pathJoin(globeDir, '.globe.state.json');

const globePlatforms = {
  expo: require('./platforms/expo.js'),
  web: require('./platforms/web.js'),
};

const getAppPackage = async appName => {
  const appDir = pathJoin(globeDir, appName);
  const appPkgPath = pathJoin(appDir, 'package.json');
  let appPkg = null;
  try {
    appPkg = JSON.parse(await fs.readFile(appPkgPath));
  } catch (e) {
    throw new Error(`Failed to read package file at "${appPkgPath}"`);
  }
  return appPkg;
};

const getAppPlatform = async (appName, appPkg) => {
  const platformName = appPkg && appPkg.globe && appPkg.globe.env;
  const platformModule = globePlatforms[platformName];
  if (!platformModule) {
    throw new Error(
      `Failed to load platform env "${platformName}" as specified in package.json globe.env for "${appName}"`,
    );
  }
  platformModule.name = platformName;
  return platformModule;
};

const readGlobeState = async () => {
  let state = {};
  try {
    state = JSON.parse(await fs.readFile(globeStatePath));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
  }
  return state;
};

const writeGlobeState = async state => {
  const stateData = JSON.stringify(state);
  await fs.writeFile(globeStatePath, stateData);
};

const changeAppState = async (appName, transactor) => {
  const state = await readGlobeState();
  let lastAppState = state.apps && state.apps[appName];
  await writeGlobeState({
    ...state,
    apps: {
      ...state.apps,
      [appName]: transactor(lastAppState || {}),
    },
  });
};
const initLocation = async (appName, appPkg, platform, appState) => {
  const newLocation = pathJoin(homeDir, '.globe', appName + '_' + uuid());
  await fs.mkdirp(newLocation);
  await platform.init({
    globeDir,
    appName,
    appPkg,
    location: newLocation,
  });
  return {
    location: newLocation,
    ...appState,
  };
};
const getAppLocation = async (appName, appPkg, platform, appState) => {
  if (!appState || !appState.location) {
    return initLocation(appName, appPkg, platform, appState);
  }
  if (!(await fs.exists(appState.location))) {
    return initLocation(appName, appPkg, platform, appState);
  }
  return appState;
};

const runStart = async argv => {
  const appName = argv._[1];
  const appPkg = await getAppPackage(appName);
  const platform = await getAppPlatform(appName, appPkg);

  const state = await readGlobeState();
  let appState = state.apps && state.apps[appName];
  appState = await getAppLocation(appName, appPkg, platform, appState);

  const goSync = async () => {
    console.log(
      `🌐 🏹 Syncronizing Workspace to App "${appName}" at ${
        appState.location
      }`,
    );
    await platform.sync({
      globeDir,
      appName,
      appPkg,
      location: appState.location,
    });
  };
  await writeGlobeState({
    ...state,
    apps: {
      ...state.apps,
      [appName]: appState,
    },
  });
  await goSync();

  const watcher = sane(globeDir, { watchman: true });

  watcher.on('change', async (filepath, root, stat) => {
    await goSync();
  });
  watcher.on('add', async (filepath, root, stat) => {
    await goSync();
  });
  watcher.on('delete', async (filepath, root) => {
    await goSync();
  });
  await new Promise(resolve => {
    watcher.on('ready', () => {
      console.log(`🌐 👓 Watching ${globeDir} for changes`);
      resolve();
    });
  });

  await platform.start({
    globeDir,
    appName,
    appPkg,
    location: appState.location,
  });

  watcher.close();
};

const runBuild = async argv => {
  const appName = argv._[1];
  const appPkg = await getAppPackage(appName);
  const platform = await getAppPlatform(appName, appPkg);
  const state = await readGlobeState();
  let appState = state.apps && state.apps[appName];
  appState = await getAppLocation(appName, appPkg, platform, appState);
  const buildId = uuid();
  const buildLocation = pathJoin(
    homeDir,
    '.globe',
    appName + '_build_' + buildId,
  );

  await fs.mkdirp(buildLocation);
  await platform.init({
    globeDir,
    appName,
    appPkg,
    location: buildLocation,
  });

  await platform.build({
    globeDir,
    appName,
    appPkg,
    location: buildLocation,
  });

  return { buildLocation };
};
const runDeploy = async argv => {
  const appName = argv._[1];
  const appPkg = await getAppPackage(appName);
  const platform = await getAppPlatform(appName, appPkg);
  const state = await readGlobeState();
  let appState = state.apps && state.apps[appName];
  appState = await getAppLocation(appName, appPkg, platform, appState);
  const buildId = uuid();
  const buildLocation = pathJoin(
    homeDir,
    '.globe',
    appName + '_build_' + buildId,
  );

  await fs.mkdirp(buildLocation);
  await platform.init({
    globeDir,
    appName,
    appPkg,
    location: buildLocation,
  });

  await platform.build({
    globeDir,
    appName,
    appPkg,
    location: buildLocation,
  });

  await platform.deploy({
    globeDir,
    appName,
    appPkg,
    location: buildLocation,
  });

  return { buildLocation };
};
const runClear = async () => {
  await fs.remove(globeHomeDir);
  await fs.remove(globeStatePath);
};
module.exports = {
  runStart,
  runBuild,
  runDeploy,
  runClear,
};
