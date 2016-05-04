var _ = require('underscore');
var async = require('async');
var self = require('../models/hypervisors.js');
var pkgcloud = require('pkgcloud');
var SSH = require('simple-ssh');
var client = require('../config/config.js');
var telemetry = require('../models/telemetry.js');
var ERROR = require('../errors/errors');
var config = require('../config/config');

//--- Variables Globals

var freeVcpus = 0;
var percent = 1;
var relation = 2;

/*--------------------------------*/

var compute = pkgcloud.compute.createClient(client.options);

// GET LIST OF ALL HYPERVISORS

exports.hypervisorsList = function(callback) {
  compute.getHypervisors(function(err, hypervisors) {
    if (err) {
      callback(500, err);
    } else {
      var result = [];
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

//GET HYPERVISOR BY NAME

exports.getHypervisor = function(hypervisor, callback) {
  async.auto({
    f1: function(callback) {
      self.hypervisorsList(function(hypervisors) {
        var find = _.findWhere(hypervisors, {
          name: hypervisor
        });
        if (_.isUndefined(find)) callback(ERROR.noExists);
        else return callback(null, find);
      });
    },
    f2: ['f1', function(callback, obj) {
      var hypervisor = obj.f1;
      telemetry.getStatistics('compute.node.cpu.percent', hypervisor.name,
        1,
        function(err, result) {
          if (err) callback(err);
          else {
            hypervisor.cpuUsage = result[0].avg;
            callback(null, hypervisor);
          }
        });
    }]
  }, function(err, result) {
    if (err) return callback(err);
    else return callback(null, result.f2);
  });

}

// GET ALL HYPERVISORS VIABLE TO LAUNCH A CERTAIN FLAVOR SORTED BY CPU USAGE

exports.hypervisorsAviableByCPU = function(flavor, callback) {
  self.findHypervisors(flavor, 'up', function(err, hypervisors) {
    if (err) return callback(err);
    async.each(hypervisors, function(hypervisor, cb) {
        telemetry.getStatistics('compute.node.cpu.percent', hypervisor.name,
          1,
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
          var arr = [];
          _.each(hypervisors, function(hypervisor) {
            if (hypervisor.cpuUsage < config.maxCPU) {
              arr.push(hypervisor);
            }
          });
          var sorted = _.sortBy(arr, 'cpuUsage');
          return callback(null, sorted);
        }
      });
  });
}

exports.getVMCPU = function(id, callback) {
  telemetry.getStatistics('cpu_util', id, 1, function(err, result) {
    if (err) return callback(err);
    else return callback(null, result[0].avg);
  });
}

exports.getHypervisorInstancesCpu = function(hypervisor, callback) {
  async.auto({
    instances: function(callback) {
      self.getHypervisorInstances(hypervisor, function(err, hypervisors) {
        if (err) callback(err);
        else callback(null, hypervisors.servers);
      });
    },
    instanceInfo: ['instances', function(callback, instances) {
      self.getInfoServers(instances.instances, function(err, result) {
        if (err) callback(err);
        else callback(null, result);
      });
    }],
    cpu: ['instanceInfo', function(callback, instances) {
      var array = [];
      async.each(instances.instanceInfo, function(instance, cb) {
        self.getVMCPU(instance.id, function(err, cpu) {
          if (err) cb(err);
          else {
            instance.cpuUsage = cpu;
            array.push(instance);
            cb();
          }
        });
      }, function(err) {
        if (err) callback(err);
        else callback(null, array);
      });
    }]
  }, function(err, result) {
    if (err) return callback(err);
    else return callback(null, result.cpu);
  })
};

exports.testCpu = function(callback) {
  async.auto({
      hypervisors: function(callback) {
        var flavorname = 'm1.tiny';
        compute.getFlavors(function(err, flavors) {
          var flavor = _.findWhere(flavors, {
            name: flavorname
          });
          self.hypervisorsAviableByCPU(flavor, function(err,
            hypervisors) {
            if (err) callback(err);
            else callback(null, hypervisors[0]);
          });
        });
      },
      cpu: ['hypervisors', function(callback, obj) {
        console.log(obj);
        self.getHypervisorInstancesCpu('compute3', function(
          err, result) {
          if (err) callback(err);
          else callback(null, result[0]);
        });
      }],
      total: ['cpu', function(callback, obj) {
        console.log(obj);
        self.getHypervisorCpuNewVM(obj.hypervisors, obj.cpu,
          function(
            err, result) {
            if (err) callback(err);
            else callback(null, result);
          })
      }]
    },
    function(err, result) {
      if (err) return callback(err);
      else return callback(null, result.total.f2);
    });
}
exports.getHypervisorCpuNewVM = function(hypervisor, instance,
  callback) {
  async.auto({
    f1: function(callback) {
      compute.getFlavor(instance.flavor, function(err, flavor) {
        if (err) callback(err);
        else callback(null, flavor);
      })
    },
    f2: ['f1', function(callback, flavor) {
      var cpuFlavor = flavor.f1.vcpus * instance.cpuUsage;
      var newCpu = cpuFlavor / hypervisor.vcpus;
      hypervisor.cpuUsage = hypervisor.cpuUsage + newCpu;
      callback(null, hypervisor);
    }]
  }, function(err, result) {
    if (err) return callback(err);
    else return callback(null, result);
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
        var migrateTo = _.find(hypervisors, function(
          hypervisor) {
          //  if(hypervisor.vcpusUsed >0){
          async.parallel([
            function(callback) {
              if ((flavor.vcpus + hypervisor.vcpusUsed) <
                (hypervisor.vcpus - freeVcpus)) {
                callback(null);
              } else callback(true);
            },
            function(callback) {
              if ((flavor.ram + hypervisor.ramUsed) <
                (
                  hypervisor.ramTotal * percent)) {
                callback(null);
              } else callback(true);
            },
            function(callback) {

              if ((flavor.disk + hypervisor.usedDisk) <
                (
                  hypervisor.totalDisk * percent)
              ) {
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
      hypervisorParams(flavor, hypervisor, state, function(
        err, res) {
        if (!err) result.push(hypervisor);
      });
    });
    if (_.isEmpty(result)) {
      return callback(ERROR.noHypervisorsFound);
    } else return callback(null, result);
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


exports.sleepHypervisor = function(hypervisor, callback) {
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
  async.waterfall([
      function(callback) {
        telemetry.getAlarms(function(err, result) {
          console.log(result);
          if (err) callback(err);
          else callback(null, result);
        });
      },
      function(alarms, callback) {
        var filtered = _.filter(alarms, {
          description: hypervisor
        });
        async.each(filtered, function(alarm, cb) {
          var id = alarm.alarm_id;
          telemetry.deleteAlarm(id, function(err, result) {
            if (err) cb(err);
            else cb();
          });
        }, function(err) {
          if (err) callback(err);
          else callback(null);
        });
      }
    ],
    function(err, result) {
      if (err) return callback(err);
      else return callback(null);
    });
};

exports.awakeHypervisor = function(hypervisor, callback) {
  var ssh = new SSH({
    host: hypervisor,
    user: 'root',
    pass: 'telematica'
  });
  ssh.exec('service nova-compute start', {
    out: function(stdout) {}
  }).start();
  var opt = config.alarmOptions;
  opt.query = {
    field: "resource_id",
    type: "",
    value: hypervisor + '_' + hypervisor,
    op: "eq"
  };
  var urlAlarm = opt.alarm_actions;
  async.parallel({
    over: function(callback) {
      var details = opt;
      details.alarm_actions = urlAlarm + 'over/' + hypervisor;
      details.name = 'cpuOver.' + hypervisor;
      details.comparison_operator = 'gt';
      details.threshold = config.maxCPU;
      details.description = hypervisor;
      telemetry.createAlarm(details, function(err, result) {
        if (err) callback(err);
        else callback(null, result);
      });

    },
    under: function(callback) {
      var details = opt;
      details.alarm_actions = urlAlarm + 'under/' + hypervisor;
      details.name = 'cpuUnder.' + hypervisor;
      details.comparison_operator = 'lt';
      details.threshold = config.minCPU;
      details.description = hypervisor;
      telemetry.createAlarm(details, function(err, result) {
        if (err) callback(err);
        else callback(null, result);
      });
    }
  }, function(err, result) {
    if (err) return callback(err);
    else return callback(null);
  });
}

exports.getHypervisorInstances = function(hypervisor, callback) {
  compute.getHypervisorInstances(hypervisor, function(err,
    hypervisorInf) {
    if (err) callback(err);
    else callback(null, hypervisorInf[0]);
  });
};

exports.getInfoServers = function(servers, callback) {
  var array = [];
  if (!servers) callback(array);
  else {
    async.each(servers, function(server, cb) {
      compute.getServer(server.uuid, function(serverCmp) {
        var push = {
          'id': serverCmp.id,
          'name': serverCmp.name,
          'flavor': serverCmp.flavor.id
        };
        compute.getFlavor(push.flavor, function(err, result) {
          if (err) cb(err);
          else {
            push.vcpus = result.vcpus;
            push.flavorName = result.name;
            array.push(push);
            cb();
          }
        });
      });
    }, function(err) {
      if (err) return callback(err);
      else return callback(null, array);
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
