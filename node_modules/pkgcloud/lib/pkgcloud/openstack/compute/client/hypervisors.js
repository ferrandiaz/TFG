var pkgcloud = require('../../../../../lib/pkgcloud'),
  urlJoin = require('url-join'),
  compute = pkgcloud.providers.openstack.compute;

var _urlHypervisor = '/os-hypervisors/';
var _urlHosts = '/os-hosts';
/**
 * client.getHypervisors
 **/

exports.getHypervisors = function getHypervisors(options, callback) {
  var self = this;

  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  var requestOptions = {
    path: urlJoin(_urlHypervisor, 'detail')
  };

  return this._request(requestOptions, function(err, body) {
    if (err) {
      return callback(err);
    }
    if (!body || !body.hypervisors) {
      return callback(new Error('Unexpected empty response'));
    } else {
      return callback(null, body.hypervisors, (function(result) {
        //  console.log(result);
        return new compute.hypervisors(self, result);
      }));
    }
  });
};

exports.getHypervisorInstances = function getHypervisor(hypervisorName,
  callback) {
  var self = this;
  return this._request({
    path: urlJoin(_urlHypervisor, hypervisorName + '/servers')
  }, function(err, body) {
    if (err) {
      return callback(err);
    }
    if (!body || !body.hypervisors) {
      return callback(new Error('Unexpected empty response'));
    } else {
      return callback(null, body.hypervisors, (function(result) {
        //  console.log(result);
        return new compute.hypervisors(self, result);
      }));
    }
  });
}



exports.getHosts = function getHosts(options, callback) {
  var self = this;

  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  var requestOptions = {
    path: urlJoin(_urlHosts)
  };

  return this._request(requestOptions, function(err, body) {
    //  console.log(requestOptions);
    if (err) {
      return callback(err);
    }
    if (!body) {
      return callback(new Error('Unexpected empty response'));
    } else {
      return callback(null, body, (function(result) {
        //  console.log(result);
        return result;
      }));
    }
  });
};

exports.getHost = function getHost(hostName, callback) {
  var self = this;
  return this._request({
    path: urlJoin(_urlHosts, hostName)
  }, function(err, body) {
    if (err) {
      return callback(err);
    }
    if (!body) {
      return callback(new Error('Unexpected empty response'));
    } else {
      console.log(body);
      return callback(null, body);
    }
  });
};
