
var gitlab = require('node-gitlab');
var lang = require('zero-lang');
var PromiseShim = require('zero-async/Promise');

module.exports = function(options) {
  // clients
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

  // sync members // 別のスクリプトで処理する

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
            console.error('!!!--> creating label error: ', err);
          } else {
            console.log('### creating label completed');
          }
        });
      });
    });
  });

  // sync milestones
  var smByIid = {};
  var smById = {};
  var tmByIid = {};
  sourceCli.milestones.list({
    id: sourceProjectId
  }, function (err, sourceMilestones) {
    console.log('### listing source milestones completed');
    sourceMilestones = sourceMilestones || [];
    lang.each(sourceMilestones, function (sm) {
      smByIid[sm.iid] = sm;
      smById[sm.id] = sm;
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
                  console.error('!!!--> creating milestone error: ', err);
              } else {
                console.log('### creating milestone completed');
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
  var siByIid = {};
  var tiByIid = {};
  function syncIssues () {
    var memberByUsername = {};
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
      // get assignee of issue
      issuesListingPromises.push(new PromiseShim(function (resolve, reject) {
        targetCli.projectMembers.list({
          id: targetProjectId
        }, function (err, members) {
          lang.each(members, function (member) {
            memberByUsername[member.username] = member;
          });
          resolve();
        });
      }));
      issuesListingPromises.push(new PromiseShim(function (resolve, reject) {
        targetCli.issues.list({
          id: targetProjectId,
          page: targetIssuesPage ++,
        }, function (err, targetIssues) {
          if (err || !targetIssues.length) {
            console.log('### listing target issues completed');
            console.log('### start processing issues');
            PromiseShim.all(issuesListingPromises).then(function () {
              console.log('### start processing issues');
              processIssues();
            });
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
      var syncIssueTimeout = 100;
      lang.forIn(siByIid, function (issue, iid) {
        setTimeout(function () {
          var assignee = issue.assignee ?
            memberByUsername[issue.assignee.username] || null :
            null;
          var milestone = issue.milestone ?
            tmByIid[smById[issue.milestone.id].iid] || null :
            null;
          if (tiByIid[iid]) {
            if (options.force) {
              console.log(issue);
              // update issues for target project
              targetCli.issues.update({
                id: targetProjectId,
                issue_id: tiByIid[iid].id,
                title: issue.title,
                description: issue.description,
                assignee_id: assignee ? assignee.id : null,
                milestone_id: milestone ? milestone.id : null,
                labels: issue.labels.join(','),
                state_event: tiByIid[iid].state === issue.state ? '' :
                  issue.state === 'opened' || issue.state === 'reopened' ? 'reopen' : 'close',
              }, function (err) {
                //syncIssueNotesByIid(iid);
                if (err) {
                  return console.error('!!!--> overriding issue error: ', err);
                } else {
                  console.log('### overriding issue completed');
                }
              });
            }
          } else {
            // create issues for target project
            targetCli.issues.create({
                id: targetProjectId,
                title: issue.title,
                description: issue.description,
                assignee_id: assignee ? assignee.id : null,
                milestone_id: milestone ? milestone.id : null,
                labels: issue.labels.join(','),
            }, function (err, newTargetIssue) {
              if (err) {
                return console.error('!!!--> creating issue error: ', err);
              } else {
                console.log('### creating issue completed');
              }
              tiByIid[newTargetIssue.iid] = newTargetIssue;
              //syncIssueNotesByIid(iid);
              if (issue.state !== 'opened') {
                targetCli.issues.update({
                  id: targetProjectId,
                  issue_id: newTargetIssue.id,
                  state_event: issue.state,
                }, function (err) {
                  if (err) {
                    console.error('!!!--> updating issue state error: ', err);
                  } else {
                    console.log('### updating issue state completed');
                  }
                });
              }
            });
          }
        }, syncIssueTimeout += 100);
      });
    }
  }

  // sync issue notes
  function syncIssueNotesByIid (iid) {
    var syncIssueNoteTimeout = 100;
    var si = siByIid[iid];
    sourceCli.issues.listNotes({
      id: sourceProjectId,
      issue_id: si.id,
    }, function (err, notes) {
      if (err) {
        return console.error('!!!--> listing issue notes error: ', err);
      } else {
        console.log('### listing issue notes completed');
      }
      lang.each(notes, function (note) {
        setTimeout(function () {
          if (tiByIid[iid]) {
            targetCli.issues.createNote({
              id: targetProjectId,
              issue_id: tiByIid[iid].id,
              body: note.body
            }, function (err) {
              if (err) {
                return console.error('!!!--> creating issue note error: ', err);
              } else {
                console.log('### creating issue note completed');
              }
            });
          }
        }, syncIssueNoteTimeout += 100);
      });
    });
  }
};

