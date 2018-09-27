const fs = require('fs-extra');
const pathJoin = require('path').join;
const spawn = require('@expo/spawn-async');
const { syncAllPackages } = require('./utils');

const protoPath = pathJoin(__dirname, '../proto/expo');

const sync = async ({ appName, appPkg, location, globeDir }) => {
  await syncAllPackages(globeDir, location);
  const appPath = pathJoin(location, 'App.js');
  const mainAppFileData = `
    import App from './${appName}/${appPkg.main}';
    
    export default App;`;
  await fs.writeFile(appPath, mainAppFileData);
  const defaultExpoConfig = {
    name: 'app',
    description: 'App description coming soon',
    slug: 'expo-app',
    privacy: 'unlisted',
    sdkVersion: '30.0.0',
    platforms: ['ios', 'android'],
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    updates: {
      fallbackToCacheTimeout: 0,
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
    },
  };
  const appExpoConfig = appPkg.globe.envOptions && appPkg.globe.envOptions.app;
  const expoConfig = { ...defaultExpoConfig, ...appExpoConfig };
  const appJsonData = JSON.stringify({ expo: expoConfig }, null, 2);
  await fs.writeFile(pathJoin(location, 'app.json'), appJsonData);

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
};

const init = async ({ appName, appPkg, location, globeDir }) => {
  console.log('WOAH');
  await fs.mkdirp(location);
  console.log('WOAHB');
  await fs.copy(pathJoin(protoPath), location);
  console.log('WOAHC', location);
};

const start = async ({ appName, appPkg, location, globeDir }) => {
  console.log('STARTING EXPO!', appName, appPkg, location, globeDir);
  await spawn('exp', ['start'], { cwd: location, stdio: 'inherit' });
};

module.exports = {
  init,
  start,
  sync,
};
