#!/usr/bin/env node
/* jshint esnext: true, node: true, loopfunc: true, undef: true, unused: true */

var commander = require('commander');
var path = require('path');

var pkg = require(path.resolve(__dirname, '../package.json'));

commander.version(pkg.version);

// sync
commander
  .command('sync')
  .description('sync between two gitlab projects')
  .option('--from-api <url>', 'source project gitlab-api url')
  .option('--from-token <token>', 'source project gitlab token')
  .option('--from-project <namespace/project_name>', 'source project name')
  .option('--to-api <url>', 'target project gitlab-api url')
  .option('--to-token <token>', 'target project gitlab token')
  .option('--to-project <namespace/project_name>', 'target project name')
  .option('--force', 'override or delete resources of the target project')
  .action(function(options) {
    require('../lib/sync')(options);
  });

commander.parse(process.argv);

if (process.argv.length === 2) {
  commander.outputHelp();
}

