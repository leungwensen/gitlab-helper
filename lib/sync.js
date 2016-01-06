
var gitlab = require('node-gitlab');
var lang = require('zero-lang');

module.exports = function(options) {
  var sourceCli = gitlab.createPromise({
    api: options.fromApi,
    privateToken: options.fromToken,
  });
  var targetCli = gitlab.createPromise({
    api: options.toApi,
    privateToken: options.toToken,
  });

  // sync members // 別のスクリプトでやる
  // sync labels
  // sync milestones
  // sync issues
  // sync issue notes

  sourceCli.milestones.list({
    id: options.fromProject
  })
  .then(function (milestones) {
    console.log(milestones);
    lang.each(milestones, function (milestone) {
      targetCli.milestones.get({
        id: options.toProject,
        milestone_id: milestone.iid,
      }).then(function (m) {
        console.log(m);
      });
    });
  })
  .catch(function (err) {
    throw err;
  });

  targetCli.milestones.list({
    id: options.toProject
  })
  .then(function (milestones) {
    console.log(milestones);
  })
  .catch(function (err) {
    throw err;
  });

};

