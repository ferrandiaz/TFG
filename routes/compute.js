_ = require('underscore');
var pkgcloud = require('pkgcloud');

var compute = pkgcloud.compute.createClient({
    provider: 'openstack',
    username: 'admin',
    password: 'telematica',
    region: 'RegionOne',
    authUrl: 'http://controller:35357'
});
exports.getServers = function(req,res){
    compute.getServers(function(err, servers){
        if(err) res.send(500);
        else res.send(servers);
    })
};