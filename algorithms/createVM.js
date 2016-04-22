var _ = require('underscore');
var async = require('async');
var pkgcloud = require('pkgcloud');
var hypervisors = require('../models/hypervisors.js');
var telemetry = require('../models/telemetry.js');
var config = require('../config/config.js');
var listener = require('../listener/listener');
var ERROR = require('../errors/errors');
var compute = pkgcloud.compute.createClient(config.options);

exports.createVM = function(obj, callback) {
  async.auto({
      validate: function(callback) {
        validateParams(obj, function(err, result) {
          if (err) return callback(err);
          else callback(null, result);
        });
      },
      hypervisors: ['validate', function(callback, result) {
        hypervisors.hypervisorsAviableByCPU(result.validate.flavor,
          function(err, hypervisors) {
            _.each(hypervisors, function(hypervisor) {
              if (hypervisor.cpuUsage >= config.maxCPU) {
                var i = _.indexOf(hypervisors, hypervisor);
                delete hypervisors[i];
              }
            });
            if (err) callback(null);
            else callback(null, hypervisors);
          });
      }],
      finalHypervisor: ['hypervisors', function(callback, result) {
        var hypervisor;
        if (!_.isUndefined(_.first(result.hypervisors))) {
          hypervisor = _.first(result.hypervisors);
          callback(null, hypervisor);
        } else {
          hypervisors.findHypervisors(result.validate.flavor, 'down',
            function(err, array) {
              if (err) callback(err);
              else {
                hypervisor = _.first(array);
                console.log(hypervisor);
                hypervisors.awakeHypervisor(hypervisor.name, function(
                  err, awaked) {
                  if (err) callback(err);
                  else callback(null, hypervisor);
                })
              }
            });
        }
      }],
      createServer: ['finalHypervisor', function(callback, create) {
        var serverParams = {};
        console.log(create.finalHypervisor);
        serverParams.image = create.validate.image;
        serverParams.flavor = create.validate.flavor;
        serverParams.name = obj.name;
        serverParams.networks = obj.networks
        serverParams.hypervisor = 'nova:' + create.finalHypervisor.name;
        compute.createServer(serverParams, function(err, server) {
          listener.listenerClose('startServerQueue',
            function(err, msg) {
              if (err) callback(err);
              else callback(null, 'Server Created in Hypervisor ' +
                create.finalHypervisor.name);
            });
        });
      }]
    },
    function(err, result) {
      if (err) callback(err);
      else callback(null, result);
    });
}

//Validate Params passed in POST to create the VM
function validateParams(obj, callback) {
  async.parallel({
    image: function(callback) {
      var imageName = obj.image;
      compute.getImages(function(err, images) {
        if (err) callback(err);
        var img = _.findWhere(images, {
          name: imageName
        });
        if (!img) callback(ERROR.imageNotFound);
        else callback(null, img);
      })
    },
    flavor: function(callback) {
      var flavorName = obj.flavor;
      compute.getFlavors(function(err, flavors) {
        if (err) callback(err);
        var flv = _.findWhere(flavors, {
          name: flavorName
        });
        if (!flv) callback(ERROR.flavorNotFound);
        else callback(null, flv);
      });
    }
  }, function(err, result) {
    if (err) callback(err);
    else callback(null, result);
  });
}
