
var util = require('util'),
    model = require('../base/model');

var meter = exports.meter = function (client, details) {
  model.Model.call(this, client, details);
};

util.inherits(meter, model.Model);

meter.prototype.refresh = function (callback) {
  return this.client.getmeter(this, callback);
};
