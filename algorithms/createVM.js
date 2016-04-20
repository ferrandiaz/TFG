var _ = require('underscore');
var async = require('async');
var pkgcloud = require('pkgcloud');
var hypervisors = require('../models/hypervisors.js');
var telemetry = require('../models/telemetry.js');
var client = require('../config/config.js');
var compute = pkgcloud.compute.createClient(client.options);

exports.createVM = function(obj, callback) {
  async.auto({
      validate: function(callback) {
        validateParams(obj, function(err, result) {
          if (err) callback(err);
          else callback(null, result);
        });
      },
      hypervisor: ['validate', function(callback, validate) {
        hypervisors.hypervisorsAviable(validate.flavor, function(err,
          hypervisors) {
          if (err) callback(err);
          else callback(null, hypervisors);
        })
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
      var imageName = obj.body.image;
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
      var flavorName = obj.body.falvor;
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
