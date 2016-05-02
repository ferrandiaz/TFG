var _ = require('underscore');
var async = require('async');
var pkgcloud = require('pkgcloud');
var hypervisors = require('../models/hypervisors.js');
var telemetry = require('../models/telemetry.js');
var client = require('../config/config.js');

exports.alarmNotification = function(req, res) {
  console.log(req.body);
  console.log('ALARM NOTIFICATION');
  res.status(200).send('OK');
}

exports.getAlarms = function(req, res) {
  telemetry.getAlarms(function(err, message) {
    console.log(err, message);
    res.status(200).send(message);
  })
}
