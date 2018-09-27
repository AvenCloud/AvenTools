const fs = require('fs-extra');
const pathJoin = require('path').join;
const spawn = require('@expo/spawn-async');

const protoPath = pathJoin(__dirname, '../proto/dom');

const getPackageSourceDir = location => pathJoin(location, 'src-sync');

const getTemplatePkg = async () => {
  const pkgPath = pathJoin(protoPath, 'package.template.json');
  const pkg = JSON.parse(await fs.readFile(pkgPath));
  return pkg;
};

const applyPackage = async ({ location, appName, appPkg, distPkg }) => {
  const appPath = pathJoin(location, 'App.js');
  const mainAppFileData = `
import App from './src-sync/${appName}/${appPkg.main}';

export default App;`;
  await fs.writeFile(appPath, mainAppFileData);

  const distPkgPath = pathJoin(location, 'package.json');
  await fs.writeFile(distPkgPath, JSON.stringify(distPkg, null, 2));

  await spawn('yarn', { cwd: location, stdio: 'inherit' });
};

const init = async ({ appName, appPkg, location, globeDir }) => {
  await fs.mkdirp(location);
  await fs.copy(pathJoin(protoPath), location);
};

const start = async ({ appName, appPkg, location, globeDir }) => {
  await spawn('yarn', ['start'], { cwd: location, stdio: 'inherit' });
};

module.exports = {
  init,
  start,
  getPackageSourceDir,
  applyPackage,
  getTemplatePkg,
};
