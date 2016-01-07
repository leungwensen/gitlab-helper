
var gitlab = require('node-gitlab');
var lang = require('zero-lang');
var PromiseShim = require('zero-async/Promise');

module.exports = function(options) {
  var sourceCli = gitlab.create({
    api: options.fromApi,
    privateToken: options.fromToken,
  });
  var targetCli = gitlab.create({
    api: options.toApi,
    privateToken: options.toToken,
  });

  // project id(required)
  var sourceProjectId = options.fromProject;
  var targetProjectId = options.toProject;

  // sync members // 別のスクリプトでやる

  // sync labels
  sourceCli.projects.getLabels({
    id: sourceProjectId
  }, function (err, sourceLabels) {
    console.log('### listing source labels completed');
    sourceLabels = sourceLabels || [];
    var labelByName = {};
    lang.each(sourceLabels, function (sl) {
      labelByName[sl.name] = sl;
    });
    targetCli.projects.getLabels({
      id: targetProjectId
    }, function (err, targetLabels) {
      console.log('### listing target labels completed');
      targetLabels = targetLabels || [];
      lang.each(targetLabels, function (tl) {
        if (labelByName[tl.name]) {
          if (options.force && tl.color !== labelByName[tl.name].color) {
            // override target labels
            targetCli.projects.updateLabel({
              id: targetProjectId,
              name: tl.name,
              new_name: tl.name,
              color: labelByName[tl.name].color,
            }, function(err){
              if (err) {
                console.error('!!!--> overriding label error: ', err);
              } else {
                console.log('### overriding label completed');
              }
            });
          }
        } else if (options.force) {
          // delete target labels
          targetCli.projects.deleteLabel({
            id: targetProjectId,
            name: tl.name
          }, function(err){
            if (err) {
              console.error('!!!--> deleting label error: ', err);
            } else {
              console.log('### deleting label completed');
            }
          });
        }
        delete labelByName[tl.name];
      });
      // create labels for target project
      lang.forIn(labelByName, function (label, name) {
        targetCli.projects.createLabel({
          id: targetProjectId,
          name: name,
          color: label.color
        }, function(err){
          if (err) {
            console.error('!!!--> syncing label error: ', err);
          } else {
            console.log('### syncing label completed');
          }
        });
      });
    });
  });

  // sync milestones
  var smByIid = {};
  var tmByIid = {};
  sourceCli.milestones.list({
    id: sourceProjectId
  }, function (err, sourceMilestones) {
    console.log('### listing source milestones completed');
    sourceMilestones = sourceMilestones || [];
    lang.each(sourceMilestones, function (sm) {
      smByIid[sm.iid] = sm;
    });
    targetCli.milestones.list({
      id: targetProjectId
    }, function (err, targetMilestones) {
      var milestonesSyncingPromises = [];
      console.log('### listing target milestones completed');
      targetMilestones = targetMilestones || [];
      lang.each(targetMilestones, function (tm) {
        tmByIid[tm.iid] = tm;
      });
      lang.forIn(smByIid, function (m, iid) {
        if (tmByIid[iid]) {
          if (options.force) {
            milestonesSyncingPromises.push(new PromiseShim(function (resolve, reject) {
              targetCli.milestones.update({
                id: targetProjectId,
                milestone_id: tmByIid[iid].id,
                title: m.title,
                description: m.description,
                due_date: m.due_date,
              }, function (err) {
                if (err) {
                  console.error('!!!--> overriding milestone error: ', err);
                } else {
                  console.log('### overriding milestone completed');
                }
                resolve();
              });
            }));
          }
        } else {
          milestonesSyncingPromises.push(new PromiseShim(function (resolve, reject) {
            targetCli.milestones.create({
              id: targetProjectId,
              title: m.title,
              description: m.description,
              due_date: m.due_date,
            }, function (err, newTm) {
              if (err) {
                  console.error('!!!--> synciding milestone error: ', err);
              } else {
                console.log('### syncing milestone completed');
                tmByIid[newTm.iid] = newTm;
              }
              resolve();
            });
          }));
        }
      });
      PromiseShim.all(milestonesSyncingPromises).then(function () {
        // syncing issues after milestones resolved
        console.log('### start syncing issues');
        syncIssues();
      });
    });
  });

  // sync issues
  function syncIssues () {
    var siByIid = {};
    var tiByIid = {};
    var issuesListingPromises = [];
    var sourceIssuesPage = 1;
    var targetIssuesPage = 1;

    function listSourceIssues () {
      issuesListingPromises.push(new PromiseShim(function (resolve, reject) {
        sourceCli.issues.list({
          id: sourceProjectId,
          page: sourceIssuesPage ++,
        }, function (err, sourceIssues) {
          if (err || !sourceIssues.length) {
            console.log('### listing source issues completed');
            listTargetIssues();
          } else {
            lang.each(sourceIssues, function (si) {
              siByIid[si.iid] = si;
            });
            listSourceIssues();
          }
          resolve();
        });
      }));
    }

    function listTargetIssues () {
      issuesListingPromises.push(new PromiseShim(function (resolve, reject) {
        targetCli.issues.list({
          id: targetProjectId,
          page: targetIssuesPage ++,
        }, function (err, targetIssues) {
          if (err || !targetIssues.length) {
            console.log('### listing target issues completed');
            PromiseShim.all(issuesListingPromises).then(processIssues);
          } else {
            lang.each(targetIssues, function (ti) {
              tiByIid[ti.iid] = ti;
            });
            listTargetIssues();
          }
          resolve();
        });
      }));
    }

    listSourceIssues();

    function processIssues() {
      lang.forIn(siByIid, function (issue, iid) {
        if (tiByIid[iid]) {
          if (options.force) {
            targetCli.issues.update({
              id: targetProjectId,
              issue_id: tiByIid[iid].id,
              title: issue.title,
              description: issue.description,
            }, function (err) {
            });
          }
        } else {
        }
      });
    }
  }

  // sync issue notes
};

