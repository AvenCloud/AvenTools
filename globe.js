const pathJoin = require('path').join;
const fs = require('fs-extra');
const uuid = require('uuid/v1');
const sane = require('sane');
const homeDir = require('os').homedir();
const spawn = require('@expo/spawn-async');
const { syncAllPackages } = require('./platforms/utils');

const globeDir = process.cwd();
const globeHomeDir = pathJoin(homeDir, '.globe');
const globeStatePath = pathJoin(globeDir, '.globe.state.json');

const runPlatformCommand = async (cwd, cmdName) => {
  await spawn('yarn', ['globe:' + cmdName], {
    cwd,
    stdio: 'inherit',
  });
};
const selfPlatform = {
  sync: async ({ location, appName, globeDir }) => {
    const sourceLocation = pathJoin(location, 'src-sync');
    await fs.mkdirp(sourceLocation);
    await syncAllPackages(globeDir, sourceLocation, new Set([appName]));
    await spawn('yarn', [], {
      cwd: location,
      stdio: 'inherit',
    });
    await runPlatformCommand(location, 'sync');
  },
  start: async ({ location }) => {
    await runPlatformCommand(location, 'start');
  },
  build: async ({ location }) => {
    await runPlatformCommand(location, 'build');
  },
  deploy: async ({ location }) => {
    await runPlatformCommand(location, 'deploy');
  },
  runInPlace: true,
};

const globeEnvs = {
  dom: require('./platforms/dom.js'),
  expo: require('./platforms/expo.js'),
  web: require('./platforms/web.js'),
  self: selfPlatform,
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

const getAppEnv = async (appName, appPkg) => {
  const envName = appPkg && appPkg.globe && appPkg.globe.env;
  const envModule = globeEnvs[envName];
  if (!envModule) {
    throw new Error(
      `Failed to load platform env "${envName}" as specified in package.json globe.env for "${appName}"`,
    );
  }
  envModule.name = envName;
  return envModule;
};

const readGlobeState = async () => {
  let state = {};
  try {
    state = JSON.parse(await fs.readFile(globeStatePath));
    if (state.globeDir !== globeDir) {
      state = {};
      console.log('Globe has moved! Removing old globe state..');
      await fs.remove(globeStatePath);
    }
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
    globeDir,
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
  if (platform.runInPlace) {
    return { ...appState, location: pathJoin(globeDir, appName) };
  }
  if (!appState || !appState.location) {
    return await initLocation(appName, appPkg, platform, appState);
  }
  if (!(await fs.exists(appState.location))) {
    return await initLocation(appName, appPkg, platform, appState);
  }
  return appState;
};

const runStart = async argv => {
  const appName = argv._[1];
  const appPkg = await getAppPackage(appName);
  const appEnv = await getAppEnv(appName, appPkg);

  const state = await readGlobeState();
  let appState = state.apps && state.apps[appName];
  appState = await getAppLocation(appName, appPkg, appEnv, appState);
  const goSync = async () => {
    console.log(
      `🌐 🏹 Syncronizing Workspace to App "${appName}" at ${
        appState.location
      }`,
    );
    await appEnv.sync({
      globeDir,
      appName,
      appPkg,
      location: appState.location,
    });
  };
  await writeGlobeState({
    ...state,
    globeDir,
    apps: {
      ...state.apps,
      [appName]: appState,
    },
  });
  await goSync();

  const watcher = sane(globeDir, { watchman: true });

  let syncTimeout = null;
  const scheduleSync = (filepath, root, stat) => {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      goSync().catch(e => {
        console.log('ERROR after file change sync');
        console.error(e);
        process.exit(1);
      });
    }, 25);
  };
  watcher.on('change', scheduleSync);
  watcher.on('add', scheduleSync);
  watcher.on('delete', scheduleSync);
  await new Promise(resolve => {
    watcher.on('ready', () => {
      console.log(`🌐 👓 Watching ${globeDir} for changes`);
      resolve();
    });
  });

  await appEnv.start({
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
  const appEnv = await getAppEnv(appName, appPkg);
  const state = await readGlobeState();
  let appState = state.apps && state.apps[appName];
  appState = await getAppLocation(appName, appPkg, appEnv, appState);
  const buildId = uuid();
  const buildLocation = pathJoin(
    homeDir,
    '.globe',
    appName + '_build_' + buildId,
  );

  await fs.mkdirp(buildLocation);
  await appEnv.init({
    globeDir,
    appName,
    appPkg,
    location: buildLocation,
  });

  await appEnv.build({
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
  const appEnv = await getAppEnv(appName, appPkg);
  const state = await readGlobeState();
  let appState = state.apps && state.apps[appName];
  appState = await getAppLocation(appName, appPkg, appEnv, appState);
  const buildId = uuid();
  const buildLocation = pathJoin(
    homeDir,
    '.globe',
    appName + '_build_' + buildId,
  );

  await fs.mkdirp(buildLocation);
  await appEnv.init({
    globeDir,
    appName,
    appPkg,
    location: buildLocation,
  });

  await appEnv.build({
    globeDir,
    appName,
    appPkg,
    location: buildLocation,
  });

  await appEnv.deploy({
    globeDir,
    appName,
    appPkg,
    location: buildLocation,
  });

  return { buildLocation };
};
const runClean = async () => {
  await fs.remove(globeHomeDir);
  await fs.remove(globeStatePath);
};
module.exports = {
  runStart,
  runBuild,
  runDeploy,
  runClean,
};
