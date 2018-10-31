const pathJoin = require('path').join;
const fs = require('fs-extra');
const uuid = require('uuid/v1');
const sane = require('sane');
const homeDir = require('os').homedir();
const spawn = require('@expo/spawn-async');

const srcDir = process.cwd();
const avenHomeDir = pathJoin(homeDir, '.aven');
const envStatePath = pathJoin(srcDir, '.aven-env-state.json');

const extendOverride = process.env.AVEN_SRC_EXTEND_OVERRIDE;
if (extendOverride) {
  console.log(
    `⚠️ - Using AvenTools extendsSrcModule from process.env.AVEN_SRC_EXTEND_OVERRIDE (${extendOverride}). You are responsible for syncronization of the extended globe dir!`,
  );
}

const getPackageDir = async (srcDir, packageName, globePkg) => {
  const extendsSrcModule =
    globePkg && globePkg.aven && globePkg.aven.extendsSrcModule;
  let packageDir = pathJoin(srcDir, packageName);
  let extendingSrcDir = null;
  if (!(await fs.existsSync(packageDir)) && extendsSrcModule) {
    extendingSrcDir =
      extendOverride || pathJoin(srcDir, 'node_modules', extendsSrcModule);
    const extendsPkgDir = pathJoin(extendingSrcDir, packageName);
    packageDir = extendsPkgDir;
  }
  return { packageDir, extendingSrcDir };
};

const syncPackage = async (packageName, srcDir, destLocation, globePkg) => {
  const { packageDir } = await getPackageDir(srcDir, packageName, globePkg);
  const destPackage = pathJoin(destLocation, packageName);
  await spawn('rsync', [
    '-a',
    '--exclude',
    'node_modules*',
    '--exclude',
    'src-sync*',
    packageDir + '/',
    destPackage + '/',
  ]);
};

const getAllSrcDependencies = async (srcDir, packageName, globePkg) => {
  const { packageDir } = await getPackageDir(srcDir, packageName, globePkg);
  const packageJSONPath = pathJoin(packageDir, 'package.json');
  const pkgJSON = JSON.parse(await fs.readFile(packageJSONPath));
  const pkgDeps = (pkgJSON.aven && pkgJSON.aven.srcDependencies) || [];
  const childPkgDeps = await Promise.all(
    pkgDeps.map(async pkgDep => {
      return await getAllSrcDependencies(srcDir, pkgDep, globePkg);
    }),
  );
  const allPkgDeps = new Set(pkgDeps);
  allPkgDeps.add(packageName);
  childPkgDeps.forEach(cPkgDeps =>
    cPkgDeps.forEach(cPkgDep => allPkgDeps.add(cPkgDep)),
  );
  return allPkgDeps;
};

const getAllModuleDependencies = async (srcDir, packageName, globePkg) => {
  const pkgDeps = await getAllSrcDependencies(srcDir, packageName, globePkg);
  const allModuleDeps = {};
  await Promise.all(
    Array.from(pkgDeps).map(async pkgDep => {
      const { packageDir, extendingSrcDir } = await getPackageDir(
        srcDir,
        pkgDep,
        globePkg,
      );
      const packageJSONPath = pathJoin(packageDir, 'package.json');
      const pkgJSON = JSON.parse(await fs.readFile(packageJSONPath));
      const moduleDeps =
        (pkgJSON.aven && pkgJSON.aven.moduleDependencies) || [];
      const extendsSrcModulePkg =
        extendingSrcDir &&
        JSON.parse(
          await fs.readFile(pathJoin(extendingSrcDir, 'package.json')),
        );
      const srcPkg = extendsSrcModulePkg ? extendsSrcModulePkg : globePkg;
      moduleDeps.forEach(moduleDepName => {
        if (!srcPkg.dependencies[moduleDepName]) {
          throw new Error(
            'Cannot find ' +
              moduleDepName +
              ' in the globe package.json while requiring ' +
              pkgDep +
              '!',
          );
        }
        allModuleDeps[moduleDepName] = srcPkg.dependencies[moduleDepName];
      });
    }),
  );
  return allModuleDeps;
};

const getAllPublicAssetDirs = async (srcDir, packageName, globePkg) => {
  const pkgDeps = await getAllSrcDependencies(srcDir, packageName, globePkg);
  const allPublicAssetDirs = [];
  await Promise.all(
    Array.from(pkgDeps).map(async pkgDep => {
      const { packageDir } = await getPackageDir(srcDir, pkgDep, globePkg);
      const packageJSONPath = pathJoin(packageDir, 'package.json');
      const pkgJSON = JSON.parse(await fs.readFile(packageJSONPath));
      if (pkgJSON.aven && pkgJSON.aven.publicAssetDir) {
        allPublicAssetDirs.push(
          pathJoin(packageDir, pkgJSON.aven.publicAssetDir),
        );
      }
    }),
  );
  return allPublicAssetDirs;
};

const globeEnvs = {
  dom: require('./dom'),
  expo: require('./expo'),
  web: require('./web'),
};

const getAppPackage = async appName => {
  const appDir = pathJoin(srcDir, appName);
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
  const envName = appPkg && appPkg.aven && appPkg.aven.env;
  let envModule = globeEnvs[envName];
  if (!envModule) {
    const envPath = pathJoin(srcDir, envName);
    if (!(await fs.exists(envPath))) {
      throw new Error(
        `Failed to load platform env "${envName}" as specified in package.json globe.env for "${appName}"`,
      );
    }
    envModule = require(pathJoin(envPath, 'AvenEnv.js'));
    envModule.localEnv = envName;
  }
  envModule.name = envName;
  return envModule;
};

const readGlobeState = async () => {
  let state = {};
  try {
    state = JSON.parse(await fs.readFile(envStatePath));
    if (state.srcDir !== srcDir) {
      state = {};
      console.log('Aven src has moved! Removing old state..');
      await fs.remove(envStatePath);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
  }
  return state;
};

const writeAvenEnvState = async state => {
  const stateData = JSON.stringify(state);
  await fs.writeFile(envStatePath, stateData);
};

const initLocation = async (appName, appPkg, platform, appState) => {
  const newLocation = pathJoin(avenHomeDir, appName + '_' + uuid());
  await fs.mkdirp(newLocation);
  await platform.init({
    srcDir,
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
    return { ...appState, location: pathJoin(srcDir, platform.name) };
  }
  if (!appState || !appState.location) {
    return await initLocation(appName, appPkg, platform, appState);
  }
  if (!(await fs.exists(appState.location))) {
    return await initLocation(appName, appPkg, platform, appState);
  }
  return appState;
};

const sync = async (appEnv, location, appName, appPkg, srcDir) => {
  const packageSourceDir = appEnv.getPackageSourceDir(location);
  const globePkg = JSON.parse(
    await fs.readFile(pathJoin(srcDir, 'package.json')),
  );
  await fs.mkdirp(packageSourceDir);

  const existingDirs = await fs.readdir(packageSourceDir);

  const globeDepsSet = await getAllSrcDependencies(srcDir, appName, globePkg);
  const globeDeps = Array.from(globeDepsSet);
  await Promise.all(
    existingDirs
      .filter(testPkgName => !globeDepsSet.has(testPkgName))
      .map(async pkgToRemove => {
        const pkgToRemovePath = pathJoin(packageSourceDir, pkgToRemove);
        await fs.remove(pkgToRemovePath);
      }),
  );
  await Promise.all(
    globeDeps.map(async globeDep => {
      await syncPackage(globeDep, srcDir, packageSourceDir, globePkg);
    }),
  );

  const distPkgTemplate = await appEnv.getTemplatePkg(location);

  const allModuleDeps = await getAllModuleDependencies(
    srcDir,
    appName,
    globePkg,
  );

  const distPkg = {
    ...distPkgTemplate,
    dependencies: {
      ...distPkgTemplate.dependencies,
      ...appPkg.dependencies,
      ...allModuleDeps,
    },
  };

  const assetDirs = await getAllPublicAssetDirs(srcDir, appName, globePkg);
  const destAssetDir = pathJoin(location, 'public');
  await Promise.all(
    assetDirs.map(async assetDir => {
      await spawn('rsync', ['-a', assetDir + '/', destAssetDir + '/']);
    }),
  );

  await appEnv.applyPackage({
    location,
    appName,
    appPkg,
    distPkg,
  });

  return { globeDeps };
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
    return await sync(appEnv, appState.location, appName, appPkg, srcDir);
  };
  await writeAvenEnvState({
    ...state,
    srcDir,
    apps: {
      ...state.apps,
      [appName]: appState,
    },
  });
  let syncState = await goSync();

  const watcher = sane(srcDir, { watchman: true });

  let extendedGlobeWatcher =
    extendOverride && sane(extendOverride, { watchman: true });

  let syncTimeout = null;
  const scheduleSync = (filepath, root, stat) => {
    if (
      appEnv.localEnv &&
      filepath.substr(0, appEnv.localEnv.length) === appEnv.localEnv
    ) {
      return;
    }
    let shouldSync = false;
    for (let globeDep of syncState.avenDeps) {
      if (filepath.substr(0, globeDep.length) === globeDep) {
        shouldSync = true;
      }
    }
    if (!shouldSync) {
      return;
    }
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      goSync()
        .then(s => {
          syncState = s;
        })
        .catch(e => {
          console.log('ERROR after file change sync');
          console.error(e);
          process.exit(1);
        });
    }, 25);
  };
  watcher.on('change', scheduleSync);
  watcher.on('add', scheduleSync);
  watcher.on('delete', scheduleSync);

  extendedGlobeWatcher && extendedGlobeWatcher.on('change', scheduleSync);
  extendedGlobeWatcher && extendedGlobeWatcher.on('add', scheduleSync);
  extendedGlobeWatcher && extendedGlobeWatcher.on('delete', scheduleSync);

  await Promise.all([
    new Promise(resolve => {
      watcher.on('ready', () => {
        console.log(`🌐 👓 Watching ${srcDir} for changes`);
        resolve();
      });
    }),
    new Promise(resolve => {
      if (!extendedGlobeWatcher) {
        return resolve();
      }
      extendedGlobeWatcher.on('ready', () => {
        console.log(
          `🌐 👓 Watching extended globe dir ${extendOverride} for changes`,
        );
        resolve();
      });
    }),
  ]);

  await appEnv.start({
    srcDir,
    appName,
    appPkg,
    location: appState.location,
  });

  watcher.close();
  extendedGlobeWatcher && extendedGlobeWatcher.close();
};

const runBuild = async argv => {
  const appName = argv._[1];
  const appPkg = await getAppPackage(appName);
  const appEnv = await getAppEnv(appName, appPkg);
  const state = await readGlobeState();
  let appState = state.apps && state.apps[appName];
  appState = await getAppLocation(appName, appPkg, appEnv, appState);
  const buildId = uuid();
  const buildLocation = pathJoin(avenHomeDir, appName + '_build_' + buildId);

  await fs.mkdirp(buildLocation);
  await appEnv.init({
    srcDir,
    appName,
    appPkg,
    location: buildLocation,
  });

  await sync(appEnv, buildLocation, appName, appPkg, srcDir);

  await appEnv.build({
    srcDir,
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
  const buildLocation = pathJoin(avenHomeDir, appName + '_build_' + buildId);

  await fs.mkdirp(buildLocation);
  await appEnv.init({
    srcDir,
    appName,
    appPkg,
    location: buildLocation,
  });

  await sync(appEnv, buildLocation, appName, appPkg, srcDir);

  await appEnv.build({
    srcDir,
    appName,
    appPkg,
    location: buildLocation,
  });

  await appEnv.deploy({
    srcDir,
    appName,
    appPkg,
    location: buildLocation,
  });

  return { buildLocation };
};
const runClean = async () => {
  await fs.remove(avenHomeDir);
  await fs.remove(envStatePath);
};
module.exports = {
  runStart,
  runBuild,
  runDeploy,
  runClean,
};
