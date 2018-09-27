#!/usr/bin/env node

const minimist = require('minimist');
const { runClean, runStart, runBuild, runDeploy } = require('./src/globe');

const logRespectfully = (argv, logStr) => {
  if (!argv.q) {
    console.log(logStr);
  }
};
const logResult = (argv, result, successMessage) => {
  if (argv.q) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result) {
    successMessage && console.log(successMessage);
  } else {
    throw 'Positive result was not recieved!';
  }
};

const runCLI = async argv => {
  const command = argv._[0];
  switch (command) {
    case 'clean': {
      logRespectfully(argv, '🌐 Globe Clean 🔥');
      logRespectfully(
        argv,
        'Cleaning all globe apps and state. This will not touch your working directory, except for the local .globe.state.json file, which should be ignored by git.',
      );
      return runClean(argv);
    }
    case 'start': {
      logRespectfully(argv, '🌐 Globe Start 🛠 ');
      const result = await runStart(argv);
      logResult(argv, result);
      return;
    }
    case 'build': {
      logRespectfully(argv, '🌐 Globe Build 🗜');
      const result = await runBuild(argv);
      logResult(
        argv,
        result,
        `🌐 Globe Build Complete 🗜 ${result.buildLocation}`,
      );
      return;
    }
    case 'deploy': {
      logRespectfully(argv, '🌐 Globe Deploy 🚀');
      const result = await runDeploy(argv);
      logResult(argv, result, '');
      return;
    }
    case 'test': {
      logRespectfully(argv, '🌐 Globe Test 💡  (coming soon');
      return;
    }
    case 'help':
    default: {
      console.log('🌐 Globe CLI 🌐');
      console.log('Usage:');
      console.log(
        'globe start [appName] (launch the dev environment for this app)',
      );
      console.log('globe build [appName] (run a build for this app)');
      console.log('globe clear (wipe out all derived app data)');
    }
  }
};

const cliArgv = minimist(process.argv.slice(2));

runCLI(cliArgv)
  .then(() => {
    logRespectfully(cliArgv, '🌐 ✅');
  })
  .catch(console.error);
