var util = require('util'),
  model = require('../base/model');

var alarm = exports.alarm = function(client, details) {
  model.Model.call(this, client, details);
};

util.inherits(alarm, model.Model);

alarm.prototype.refresh = function(callback) {
  return this.client.getalarm(this, callback);
};
