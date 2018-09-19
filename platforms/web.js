const fs = require('fs-extra');
const pathJoin = require('path').join;
const spawn = require('@expo/spawn-async');
const { syncAllPackages } = require('./utils');

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
  await spawn('gcloud', ['app', 'deploy', '-q'], {
    cwd: location,
    stdio: 'inherit',
  });
  return {};
};

const build = async ({ appName, appPkg, location, globeDir }) => {
  await sync({ appName, appPkg, location, globeDir });
  await spawn('yarn', ['build-dev'], { cwd: location, stdio: 'inherit' });
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
