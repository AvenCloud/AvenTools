const fs = require('fs-extra');
const pathJoin = require('path').join;
const spawn = require('@expo/spawn-async');

const getGlobePackages = async globeDir => {
  const files = await fs.readdir(globeDir);
  const areDirectories = await Promise.all(
    files.map(async file => {
      const stat = await fs.stat(pathJoin(globeDir, file));
      return stat.isDirectory();
    }),
  );
  return files.filter((file, fileIndex) => {
    if (file === 'etc') {
      return false;
    }
    return areDirectories[fileIndex];
  });
};

const syncPackage = async (packageName, globeDir, destLocation) => {
  const workspacePackage = pathJoin(globeDir, packageName);
  const destPackage = pathJoin(destLocation, packageName);
  await spawn('rsync', [
    '-a',
    '--exclude',
    'node_modules*',
    workspacePackage + '/',
    destPackage + '/',
  ]);
};

const syncAllPackages = async (globeDir, destLocation) => {
  const globePackages = await getGlobePackages(globeDir);
  await Promise.all(
    globePackages.map(async globePackage => {
      await syncPackage(globePackage, globeDir, destLocation);
    }),
  );
};

module.exports = {
  syncAllPackages,
};
