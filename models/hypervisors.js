_ = require('underscore');
var self = require('../models/hypervisors.js');
var pkgcloud = require('pkgcloud');
var SSH = require('simple-ssh');

//--- Variables Globals

var freeVcpus = 0;
var percent = 1;

/*--------------------------------*/

var compute = pkgcloud.compute.createClient({
    provider: 'openstack',
    username: 'admin',
    password: 'telematica',
    tenantId : '29f1fabbe7504b34a6fc1037793cbe52',
    region: 'regionOne',
    authUrl: 'http://controller:35357',
    strictSSL : false
});

exports.hypervisorsList = function (callback) {
  compute.getHypervisors(function(err, hypervisors){
//    console.log(hypervisors);
      if(err){
        console.log(err);
        callback(500,err);
        }
      else {
        var result=[];
  //        console.log(hypervisors);
        _.each(hypervisors,function(json){
          var push = {
            'id': json.id,
            'name': json.hypervisor_hostname,
            'ip': json.host_ip,
            'status':json.status,
            'vcpus':json.vcpus,
            'vcpusUsed': json.vcpus_used,
            'ramFree':json.free_ram_mb,
            'ramTotal':json.memory_mb,
            'ramUsed':json.memory_mb_used,
            'freeDisk':json.free_disk_gb,
            'totalDisk':json.local_gb,
            'usedDisk':json.local_gb_used,
            'vmsRunning':json.running_vms,
            'state':json.state
          }
          result.push(push);
        });
        callback(result);
      }
    });
}

exports.hypervisorAviable = function(flavor, callback){
  self.hypervisorsList(function(hypervisors){
  var result =  _.find(hypervisors,function(hypervisor){
      if(hypervisor.state == 'up'){
  //      console.log(hypervisor);
        if((flavor.vcpus + hypervisor.vcpusUsed)  < (hypervisor.vcpus -freeVcpus)){
          if((flavor.ram + hypervisor.ramUsed) < (hypervisor.ramTotal*percent)){
            if((flavor.disk+ hypervisor.usedDisk) < (hypervisor.totalDisk*percent)){
          //    console.log(hypervisor);
              return hypervisor;
            }
          }
        }
      }
    });
    callback(result);
  });
}

exports.getAviablesExludeHypervisor = function(name, callback){
   self.hypervisorsList(function(hypervisors){
       var result =  _.filter(hypervisors,function(hypervisor){
         if(hypervisor.state == 'up'){
           console.log(hypervisor.name, name);
           if(hypervisor.name != name){
                  return hypervisor;
                }
        }
        });
    callback(result);
  });
}

exports.findMigrateHypervisor = function(servers, name, callback){
  var array=[];
  var i = 0;
  self.getAviablesExludeHypervisor(name,function(hypervisors){
    _.each(servers,function(server){
      compute.getFlavors(function(err,flavors){
      if(err)callback(500);
      else{
        i++;
        var flavor = _.findWhere(flavors,{id:server.flavor});
        var migrateTo = _.find(hypervisors, function(hypervisor){
        //  if(hypervisor.vcpusUsed >0){
          if((flavor.vcpus + hypervisor.vcpusUsed)  < (hypervisor.vcpus -freeVcpus)){
            if((flavor.ram + hypervisor.ramUsed) < (hypervisor.ramTotal*percent)){
              if((flavor.disk+ hypervisor.usedDisk) < (hypervisor.totalDisk*percent)){
                hypervisor.vcpusUsed = hypervisor.vcpusUsed + flavor.vcpus;
                hypervisor.ramUsed = flavor.ram + hypervisor.ramUsed;
                hypervisor.usedDisk = flavor.disk+ hypervisor.usedDisk;
                return hypervisor;
            //  }
              }
            }
          }
        });
       if(String(migrateTo) != 'undefined')  array.push({server: server.id, serverName: server.name, newHypervisor: migrateTo.id, newHypervisorName:migrateTo.name});
        if(i == servers.length)callback(array);
      }

    });
    });
  });

}

exports.findHypervisorAviableDown = function (flavor,callback) {
  self.hypervisorsList(function(hypervisors){
  var result =  _.find(hypervisors,function(hypervisor){
      if(hypervisor.state == 'down'){
        if((flavor.vcpus + hypervisor.vcpusUsed)  <= (hypervisor.vcpus -freeVcpus)){
          if((flavor.ram + hypervisor.ramUsed) <= (hypervisor.ramTotal*percent)){
            if((flavor.disk+ hypervisor.usedDisk) < (hypervisor.totalDisk*percent)){
              var ssh = new SSH({
                host:hypervisor.name,
                user: 'root',
                pass: 'telematica'
              });
              ssh.exec('service nova-compute start',{
                out:function(stdout){
                  console.log(stdout);
                }
              }).start();
              return hypervisor;
            }
          }
        }
      }
    });
    callback(result);
  });
}

exports.getHosts = function(callback){
  compute.getHosts(function(err,hosts){
    if(err) callback(err);
    else{
      callback(hosts);
    }
  })
}


exports.sleepHypervisor = function(hypervisor){
  var ssh = new SSH({
    host:hypervisor,
    user: 'root',
    pass: 'telematica'
  });
  ssh.exec('service nova-compute stop',{
    out:function(stdout){
      console.log(stdout);
    }
  }).start();
  return true;
}

exports.getHypervisorInstances = function(hypervisor,callback){
  compute.getHypervisorInstances(hypervisor,function (err, hypervisorInf){
    if(err) callback(err);
    else callback(hypervisorInf[0]);
  });
}

exports.getInfoServers = function(servers,callback){
  var array = [];
  var i = 0;
  if(!servers) callback(array);
  else{
  _.each(servers,function(server){
    compute.getServer(server.uuid,function(serverCmp){
      i++;
      var push = {
        'id': serverCmp.id,
        'name': serverCmp.name,
        'flavor': serverCmp.flavor.id
      }
      array.push(push);
      console.log(array);
      if(i == servers.length) callback(array);
    });
  });
}
}
exports.getHost = function(hostName, callback){
  compute.getHost(hostName,function(err,hosts){
    if(err) callback (err);
    else callback(hosts);
  });
}
