const fs = require('fs-extra');
const pathJoin = require('path').join;
const spawn = require('@expo/spawn-async');
const { syncAllPackages } = require('./utils');

const protoPath = pathJoin(__dirname, '../proto/dom');

const sync = async ({ appName, appPkg, location, globeDir }) => {
  const srcPath = pathJoin(location, 'src-sync');
  await fs.mkdirp(srcPath);
  await syncAllPackages(globeDir, srcPath);
  const appPath = pathJoin(location, 'App.js');
  const mainAppFileData = `
    import App from './src-sync/${appName}/${appPkg.main}';
    
    export default App;`;
  await fs.writeFile(appPath, mainAppFileData);

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
  await fs.mkdirp(location);
  await fs.copy(pathJoin(protoPath), location);
};

const start = async ({ appName, appPkg, location, globeDir }) => {
  console.log('STARTING DOM!', appName, appPkg, location, globeDir);
  await spawn('yarn', ['start'], { cwd: location, stdio: 'inherit' });
};

module.exports = {
  init,
  start,
  sync,
};
