const minimist = require('minimist');
const { runClear, runStart, runBuild, runDeploy } = require('./globe');

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
    case 'clear': {
      logRespectfully(argv, '🌐 Globe Clear 🔥');
      logRespectfully(
        argv,
        'Clearing all globe apps and state. This will not touch your working directory.',
      );
      return runClear(argv);
    }
    case 'start': {
      logRespectfully(argv, '🌐 Globe Start 🛠 ');
      const result = await runStart(argv);
      logResult(result);
    }
    case 'build': {
      logRespectfully(argv, '🌐 Globe Build 🗜');
      const result = await runBuild(argv);
      logResult(result);
      return;
    }
    case 'deploy': {
      logRespectfully(argv, '🌐 Globe Deploy 🚀');
      const result = await runDeploy(argv);
      logResult(result);
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
