var _ = require('underscore');
var async = require('async');
var pkgcloud = require('pkgcloud');
var hypervisors = require('../models/hypervisors.js');
var telemetry = require('../models/telemetry.js');
var client = require('../config/config.js');
var listener = require('../listener/listener');
var compute = pkgcloud.compute.createClient(client.options);

exports.createVM = function(obj, callback) {
  async.auto({
      validate: function(callback) {
        validateParams(obj, function(err, result) {
          console.log("========================================");
          console.log('validateParams: ');
          console.log("========================================");
          if (err) return callback(err);
          else callback(null, result);
        });
      },
      hypervisors: ['validate', function(callback, result) {
        console.log("hypervisors");
        console.log("==========================================");
        hypervisors.findHypervisors(result.validate.flavor, 'up',
          function(err,
            hypervisors) {
            if (err) callback(null);
            else callback(null, hypervisors);
          });
      }],
      finalHypervisor: ['hypervisors', function(callback, hypervisors) {
        console.log("finalHypervisor");
        console.log("==========================================");
        var hypervisor;
        if (!_.isEmpty(hypervisors.hypervisors)) {
          hypervisor = _.first(hypervisors.hypervisors);
          callback(null, hypervisor);
        } else {
          hypervisors.findHypervisors(validate.flavor, 'up', function(
            err,
            hypervisors) {
            if (err) callback(err);
            else {
              hypervisor = _.first(hypervisors);
              hypervisors.awakeHypervisor(hypervisor.name, function(
                err, result) {
                if (err) callback(err);
                else callback(null, hypervisor);
              })
            }
          });
        }
      }],
      createServer: ['finalHypervisor', function(callback, create) {
        var serverParams = {};
        serverParams.image = create.validate.image;
        serverParams.flavor = create.validate.flavor;
        serverParams.name = obj.name;
        serverParams.networks = obj.networks
        serverParams.hypervisor = 'nova:' + create.finalHypervisor.name;
        compute.createServer(serverParams, function(err, server) {
          listener.listenerClose('startServerQueue', function(err,
            msg) {
            if (err) callback(err);
            else callback(null, msg);
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
        if (!img) callback(400);
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
        if (!flv) callback(400);
        else callback(null, flv);
      });
    }
  }, function(err, result) {
    if (err) callback(err);
    else callback(null, result);
  });
}
