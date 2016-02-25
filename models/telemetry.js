_ = require('underscore');
var pkgcloud = require('pkgcloud');

var telemetry = pkgcloud.telemetry.createClient({
    provider: 'openstack',
    username: 'admin',
    password: 'telematica',
    tenantId : '4677bc5239834f7d82ca26ba6729357b',
    region: 'regionOne',
    authUrl: 'http://controller:35357',
    strictSSL : false
});

exports.getMeters = function(callback){
  telemetry.getMeters(function(err,meters){
    if(err) callback(err);
    else{
      callback(meters);
    }
  });
}
