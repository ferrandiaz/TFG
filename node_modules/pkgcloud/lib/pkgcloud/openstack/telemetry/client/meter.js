var pkgcloud = require('../../../../../lib/pkgcloud'),
  urlJoin = require('url-join'),
  telemetry = pkgcloud.providers.openstack.telemetry;



var _urlMeter = 'v2/meters';

exports.getMeters = function getMeters(callback) {
  var self = this;
  var requestOptions = {
    path: urlJoin(_urlMeter)
  };
  return this._request(requestOptions, function(err, body) {
    if (err) {
      return callback(err);
    }
    if (!body) {
      return callback(new Error('Unexpected empty response'));
    } else {
      return callback(null, body, (function(result) {
        return result;
      }));
    }
  });
};

exports.getStatistics = function(params, callback) {
  var self = this;
  if (!params.meter) return (400);
  if (!params.resourceID) return (400);
  if (!params.time) return (400);
  var resource = params.resourceID;
  if (params.meter.match(/compute.*/)) {
    resource = params.resourceID + '_' + params.resourceID
  }
  var d = new Date();
  d = d.getTime() / 1000;
  d = d - params.time * 60;
  var a = new Date(d * 1000);
  var timestamp = a.toJSON();
  var query =
    '?q.field=timestamp&q.field=resource_id&q.op=gt&q.op=eq&q.type=&q.type=&' +
    'q.value=' + timestamp +
    '&q.value=' + resource;
  var uJoin = params.meter + '/statistics' + query;
  return this._request({
      path: urlJoin(_urlMeter, uJoin)
    },
    function(err, body) {
      if (err) return callback(err);
      if (!body) {
        return callback(new Error('Unexpected empty response'));
      } else {
        return callback(null, body, (function(result) {
          return result;
        }));
      }
    });
}
