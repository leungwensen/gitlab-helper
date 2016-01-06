
var gitlab = require('gitlab');

module.exports = function(options) {
  var sourceCli = gitlab({
    token: options.fromToken,
    url: options.fromApi,
  });
  sourceCli.projects.milestones.list(options.fromProject, function (milestones) {
    console.log(milestones);
  });
};

