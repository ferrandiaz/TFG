var _ = require('underscore');
var async = require('async');
var pkgcloud = require('pkgcloud');
var hypervisors = require('../models/hypervisors.js');

exports.deleteVM = function(hypervisor) {
  hypervisors.getHypervisor(hypervisor, function(err, host) {
    if (err) console.log(err);
    else {
      if (host.vmsRunning == 0) {
        hypervisors.sleepHypervisor(hypervisor, function(err) {
          if (err) console.log(err);
          else console.log('Hypervisor ' + hypervisor +
            ' is Sleeping Now');
        });
      }
    }
  });
}
