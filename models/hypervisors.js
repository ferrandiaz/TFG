var _ = require('underscore');
var async = require('async');
var self = require('../models/hypervisors.js');
var pkgcloud = require('pkgcloud');
var SSH = require('simple-ssh');
var client = require('../config/config.js');
var telemetry = require('../models/telemetry.js');
var ERROR = require('../errors/errors');

//--- Variables Globals

var freeVcpus = 0;
var percent = 1;
var relation = 2;

/*--------------------------------*/

var compute = pkgcloud.compute.createClient(client.options);

exports.hypervisorsList = function(callback) {
  compute.getHypervisors(function(err, hypervisors) {
    //    console.log(hypervisors);
    if (err) {
      console.log(err);
      callback(500, err);
    } else {
      var result = [];
      //        console.log(hypervisors);
      _.each(hypervisors, function(json) {
        var push = {
          'id': json.id,
          'name': json.hypervisor_hostname,
          'ip': json.host_ip,
          'status': json.status,
          'vcpus': json.vcpus,
          'vcpusUsed': json.vcpus_used,
          'ramFree': json.free_ram_mb,
          'ramTotal': json.memory_mb,
          'ramUsed': json.memory_mb_used,
          'freeDisk': json.free_disk_gb,
          'totalDisk': json.local_gb,
          'usedDisk': json.local_gb_used,
          'vmsRunning': json.running_vms,
          'state': json.state
        };
        result.push(push);
      });
      callback(result);
    }
  });
};

exports.hypervisorsAviableByCPU = function(flavor, callback) {
  self.findHypervisors(flavor, 'up', function(err, hypervisors) {
    if (err) return callback(err);
    async.each(
      hypervisors,
      function(hypervisor, cb) {
        telemetry.getStatistics('compute.node.cpu.percent', hypervisor.name,
          2,
          function(err, result) {
            if (err) cb(err);
            else {
              hypervisor.cpuUsage = result[0].avg;
              cb();
            }
          });
      },
      function(err) {
        if (err) return callback(err);
        else {
          var sorted = _.sortBy(hypervisors, 'cpuUsage');
          return callback(null, sorted);
        }
      });
  });
}

exports.getAviablesExludeHypervisor = function(name, callback) {
  self.hypervisorsList(function(hypervisors) {
    var result = _.filter(hypervisors, function(hypervisor) {
      if (hypervisor.state == 'up') {
        if (hypervisor.name != name) {
          return hypervisor;
        }
      }
    });
    callback(result);
  });
};

exports.findMigrateHypervisor = function(servers, name, callback) {
  var array = [];
  var i = 0;
  self.getAviablesExludeHypervisor(name, function(hypervisors) {
    _.each(servers, function(server) {
      compute.getFlavors(function(err, flavors) {
        if (err) return callback(500);
        i++;
        var flavor = _.findWhere(flavors, {
          id: server.flavor
        });
        var migrateTo = _.find(hypervisors, function(hypervisor) {
          //  if(hypervisor.vcpusUsed >0){
          async.parallel([
            function(callback) {
              if ((flavor.vcpus + hypervisor.vcpusUsed) <
                (hypervisor.vcpus - freeVcpus)) {
                callback(null);
              } else callback(true);
            },
            function(callback) {
              if ((flavor.ram + hypervisor.ramUsed) < (
                  hypervisor.ramTotal * percent)) {
                callback(null);
              } else callback(true);
            },
            function(callback) {

              if ((flavor.disk + hypervisor.usedDisk) < (
                  hypervisor.totalDisk * percent)) {
                callback(null);
              } else callback(true);
            }
          ], function(err) {
            if (!err) {
              hypervisor.vcpusUsed = hypervisor.vcpusUsed +
                flavor.vcpus;
              hypervisor.ramUsed = flavor.ram +
                hypervisor.ramUsed;
              hypervisor.usedDisk = flavor.disk +
                hypervisor.usedDisk;
              return hypervisor;
            }
          });

        });
        if (!_.isUndefined(migrateTo)) {
          array.push({
            server: server.id,
            serverName: server.name,
            newHypervisor: migrateTo.id,
            newHypervisorName: migrateTo.name
          });
        }
        if (i == servers.length) callback(array);
      });
    });
  });
};

exports.findHypervisors = function(flavor, state, callback) {
  var result = [];
  self.hypervisorsList(function(hypervisors) {
    _.each(hypervisors, function(hypervisor) {
      hypervisorParams(flavor, hypervisor, state, function(err, res) {
        if (!err) result.push(hypervisor);
      });
    });

    if (_.isEmpty(result)) return callback(ERROR.noHypervisorFound);
    else return callback(null, result);
  });
}

exports.getHosts = function(callback) {
  compute.getHosts(function(err, hosts) {
    if (err) callback(err);
    else {
      callback(hosts);
    }
  })
};


exports.sleepHypervisor = function(hypervisor) {
  var ssh = new SSH({
    host: hypervisor,
    user: 'root',
    pass: 'telematica'
  });
  ssh.exec('service nova-compute stop', {
    out: function(stdout) {
      console.log(stdout);
    }
  }).start();
  return true;
};

exports.awakeHypervisor = function(hypervisor, callback) {
  var ssh = new SSH({
    host: hypervisor,
    user: 'root',
    pass: 'telematica'
  });
  ssh.exec('service nova-compute start', {
    out: function(stdout) {
      console.log(stdout);
    }
  }).start();
  return callback(null);
}

exports.getHypervisorInstances = function(hypervisor, callback) {
  compute.getHypervisorInstances(hypervisor, function(err, hypervisorInf) {
    if (err) callback(err);
    else callback(hypervisorInf[0]);
  });
};

exports.getInfoServers = function(servers, callback) {
  var array = [];
  var i = 0;
  if (!servers) callback(array);
  else {
    _.each(servers, function(server) {
      compute.getServer(server.uuid, function(serverCmp) {
        i++;
        var push = {
          'id': serverCmp.id,
          'name': serverCmp.name,
          'flavor': serverCmp.flavor.id
        };
        array.push(push);
        console.log(array);
        if (i == servers.length) callback(array);
      });
    });
  }
};
exports.getHost = function(hostName, callback) {
  compute.getHost(hostName, function(err, hosts) {
    if (err) callback(err);
    else callback(hosts);
  });
};

function hypervisorParams(flavor, hypervisor, state, callback) {
  if (hypervisor.state == state) {
    async.parallel([
      function(callback) {
        if (flavor.vcpus > hypervisor.vcpus) callback(true);
        else callback(null);
      },
      function(callback) {
        if ((flavor.vcpus + hypervisor.vcpusUsed) <= (
            hypervisor.vcpus * relation)) {
          callback(null);
        } else callback(true);
      },
      function(callback) {
        if ((flavor.ram + hypervisor.ramUsed) <= (hypervisor.ramTotal *
            relation)) {
          callback(null);
        } else callback(true);
      },
      function(callback) {
        if ((flavor.disk + hypervisor.usedDisk) < (hypervisor
            .totalDisk * percent)) {
          callback(null);
        } else callback(true);
      }
    ], function(err) {
      if (!err) {
        return callback(null, hypervisor);
      } else return callback(err);
    });
  }
}
