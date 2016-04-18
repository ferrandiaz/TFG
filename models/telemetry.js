_ = require('underscore');
var pkgcloud = require('pkgcloud');

var telemetry = pkgcloud.telemetry.createClient({
    provider: 'openstack',
    username: 'admin',
    password: 'telematica',
    tenantId : '29f1fabbe7504b34a6fc1037793cbe52',
    region: 'regionOne',
    authUrl: 'http://controller:35357',
    strictSSL : false
});

exports.getMeters = function(callback){
  telemetry.getMeters(function(err,meters){
    if(err) callback(err);
    else{
      callback(null,meters);
    }
  });
}
exports.getStatistics = function(meter, resource, callback){
  var params = {};
  params.meter = meter;
  params.resourceID = resource;
  telemetry.getStatistics(params,function(err,statistics){
    callback(err,statistics);
  });
}
