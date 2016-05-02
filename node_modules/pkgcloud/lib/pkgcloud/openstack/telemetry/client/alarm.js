var pkgcloud = require('../../../../../lib/pkgcloud'),
  urlJoin = require('url-join'),
  telemetry = pkgcloud.providers.openstack.telemetry;



var _urlAlarm = 'v2/alarms';
exports.getAlarms = function getAlarms(callback) {
  var self = this;
  var requestOptions = {
    path: urlJoin(_urlAlarm)
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

exports.deleteAlarm = function deleteAlarm(alarmID, callback) {
  var self = this;
  var requestOptions = {
    path: urlJoin(_urlAlarm, alarmID),
    method: 'DELETE'
  };
  return this._request(requestOptions, function(err, body) {
    if (err) {
      return callback(err);
    } else {
      return callback(null, 'OK');
    }
  });

};


exports.createAlarm = function createAlarm(details, callback) {
  if (typeof details === 'function') {
    callback = details;
    details = {};
  }

  details = details || {};

  var self = this;
  var createOptions = {
    path: _urlAlarm,
    method: 'POST',
    body: {}
  };
  createOptions.body.threshold_rule = {};
  if (details.alarm_actions) {
    createOptions.body.alarm_actions = [];
    createOptions.body.alarm_actions.push(details.alarm_actions);
  }
  if (details.name) {
    createOptions.body.name = details.name;
  }
  if (details.severity) {
    createOptions.body.severity = details.severity;
  }
  if (details.meter_name) {
    createOptions.body.threshold_rule.meter_name = details.meter_name;
  }
  if (details.evaluation_periods) {
    createOptions.body.threshold_rule.evaluation_periods = details.evaluation_periods;
  }
  if (details.period) {
    createOptions.body.threshold_rule.period = details.period;
  }
  if (details.statistic) {
    createOptions.body.threshold_rule.statistic = details.statistic;
  }
  if (details.query) {
    createOptions.body.threshold_rule.query = [];
    createOptions.body.threshold_rule.query.push(details.query);
  }
  if (details.comparison_operator) {
    createOptions.body.threshold_rule.comparison_operator = details.comparison_operator;
  }
  if (details.description) {
    createOptions.body.description = details.description;
  }

  if (details.threshold) {
    createOptions.body.threshold_rule.threshold = details.threshold;
  }

  if (details.type) {
    createOptions.body.type = details.type;
  }


  return this._request(createOptions, function(err, body) {
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
