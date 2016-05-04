var amqp = require('amqplib');
var async = require('async');
exports.listenerClose = function(queue, callback) {
  console.log('Entro');
  require('amqplib/callback_api')
    .connect('amqp://openstack:openstack@controller:5672//', function(err,
      connection) {
      console.log('CLOSE');
      async.auto({
        f1: function(callback) {
          if (err) callback(err);
          consumer(connection, queue, function(err, message) {

            return callback(null, message)
          });
        },
        f2: ['f1', function(callback, obj) {
          close(connection);
          callback(null, obj.f1);
        }]
      }, function(err, result) {
        console.log(err, result);
        if (err) callback(err);
        else callback(null, result.f2);
      })
    });
};

exports.listener = function(queue, callback) {
  require('amqplib/callback_api')
    .connect('amqp://openstack:openstack@controller:5672//', function(err,
      conn) {
      consumer(conn, queue, function(err, message) {
        return callback(null, message)
      });
    });
};

function close(conn) {
  conn.close();
}

function consumer(conn, queue, callback) {
  var ok = conn.createChannel(on_open);
  var ex = 'nova';
  var q = queue;

  function on_open(err, ch) {
    if (err != null) return callback(err);
    ch.assertExchange(ex, 'topic', {
      durable: false
    });
    ch.assertQueue(q);
    ch.bindQueue(q, ex, 'notifications.info');
    ch.consume(q, function(msg) {
      if (msg !== null) {
        var json = JSON.parse(msg.content.toString());
        _.each(json, function(ms) {
          var jMS = JSON.parse(ms);
          if (jMS.event_type === 'compute.instance.create.end') {
            return callback(null, jMS.event_type);
          }
          if (jMS.event_type === 'compute.instance.delete.end') {
            return callback(null, jMS.event_type);
          }
          if (jMS.event_type ===
            'compute.instance.live_migration._post.end') {
            return callback(null, jMS.event_type);
          }

        });
        ch.ack(msg);
      }
    });
  }
}
