_ = require('underscore');
var pkgcloud = require('pkgcloud');
var hypervisors = require('../models/hypervisors.js');

var compute = pkgcloud.compute.createClient({
    provider: 'openstack',
    username: 'admin',
    password: 'telematica',
    tenantId : '4677bc5239834f7d82ca26ba6729357b',
    region: 'regionOne',
    authUrl: 'http://controller:35357',
    strictSSL : false
});
exports.getServers = function(req,res){
 hypervisors.hypervisorsList(function(result){
     res.send(result);
  });
};

exports.getServer = function(req, res){
  hypervisors.hypervisorsList(function(listHypervisors){
    var hyperisorEnabled = _.findWhere(listHypervisors,{name:req.params.hypervisor});
    if(hyperisorEnabled.state != 'up') res.status(400).send('El Hypervisor esta apagat');
    else{
      hypervisors.getHypervisorInstances(req.params.hypervisor, function(hypervisor){
        if(!hypervisor.servers){
          console.log('entro sleep');
          hypervisors.sleepHypervisor(hypervisor.hypervisor_hostname);
          res.status(200);
        }
        else{
        hypervisors.getInfoServers(hypervisor.servers,function(servers){
          hypervisors.findMigrateHypervisor(servers, hypervisor.hypervisor_hostname,function(migrateArray){
            console.log('RESULTAT: '+migrateArray[0]);
            if(String(migrateArray[0]) == 'undefined') res.status(200).send('No hi ha cap hypervisor disponible');
            else{
              if(migrateArray.length != servers.length) res.status(200).send('Es queda tot igual');
              else{
                var k = 0;
                _.each(migrateArray,function(migrate){
                  compute.migrateServer(migrate.server, migrate.newHypervisorName,function(resposta){
                    console.log(resposta);
                    k++;
                    console.log(k,migrateArray.length);
                    if(k== migrateArray.length){
                        res.status(200).send('OK');
                      setTimeout(function(){
                        hypervisors.sleepHypervisor(hypervisor.hypervisor_hostname);
                      },20000);
                    }
                    });
                  });
                }
              }
            });
          });
        }
      });
    }
  });
}
exports.getHosts = function (req,res) {
  console.log('Entro');
  compute.getServer('f19db1b7-35bd-4980-b25b-233eebcef544',function(server){
    console.log(server);
    res.status(200).send(server);
  })
};


exports.createServer = function(req,res){
  var imagename = req.body.image;
  var flavorname = req.body.flavor;
  var name = req.body.name;
  var networks = req.body.networks;
  compute.getImages(function(err,images){
    if(err) res.status(500).send(err);
    else{
      var image = _.findWhere(images,{name:imagename});
      if(!image) res.status(400).send('Image not Found');
      compute.getFlavors(function(err,flavors){
        if(err)res.status(500).send(err);
        else{
          var flavor = _.findWhere(flavors,{name:flavorname});
          if(!flavor) res.status(400).send('Flavor not Found');
          hypervisors.hypervisorAviable(flavor,function(hypervisor){
            if(String(hypervisor) == 'undefined'){
            hypervisors.findHypervisorAviableDown(flavor,function(hypervisorNoAviable){
              if(String(hypervisorNoAviable) == 'undefined') res.status(500).send('No hi ha recursos suficients');
              else createServer(hypervisorNoAviable.name, function(response){ res.status(200).send(response)});
            });
          }else createServer(hypervisor.name, function(response){ res.status(200).send(response)});
          function createServer(hypervisorName,callback){
            console.log(hypervisorName);
            setTimeout(function(){
            compute.createServer({
              name: name,
              image: image,
              flavor: flavor,
              networks: networks,
              hypervisor: "nova:"+hypervisorName,
            },handleServerResponse);
            callback(200);
          },10000);
          }
        });
        }
      })
    }
  })

}


function handleServerResponse(err, server) {
    if (err) {
        console.dir(err);
        return;
    }
    console.log('SERVER : ' + server.name + ', waiting for active status');

    // Wait for status: RUNNING on our server, and then callback
    server.setWait({ status: server.STATUS.running }, 5000, function (err) {
        if (err) {
            console.dir(err);
            return;
        }
        console.log('SERVER INFO');
        console.log(server.name);
        console.log(server.status);
        console.log(server.id);

        console.log('Make sure you DELETE server: ' + server.id +
            ' in order to not accrue billing charges');
    });
}
