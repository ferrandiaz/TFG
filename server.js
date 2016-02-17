var express         = require("express"),
    app             = express(),
    bodyParser      = require("body-parser"),
    methodOverride = require("method-override");

    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());
    app.use(methodOverride());

var router = express.Router();
app.get('/',function(req,res){
    res.send('Hello World');
});
app.use(router);


var compute = require('./routes/compute');
var amqp = require('amqplib');
var openstack = express.Router();

openstack.route('/server')
    .get(compute.getServers)
    .post(compute.createServer);
openstack.route('/server/:hypervisor')
    .get(compute.getServer);
openstack.route('/hosts')
    .get(compute.getHosts);

app.use('/openstack',openstack);




app.listen(3000, function(){
    console.log('Server Running Port 3000');

/*

   amqp.connect('amqp://guest:RABBIT_PASS@controller:5672').then(function(conn) {
     process.once('SIGINT', function() { conn.close(); });
  return conn.createChannel().then(function(ch) {
    var ex = 'nova';
    var ok = ch.assertExchange(ex, 'topic', {durable: false});

    ok = ok.then(function() {
      return ch.assertQueue('', {exclusive: true});
    });

    ok = ok.then(function(qok) {
      var queue = qok.queue;
      return all(keys.map(function(rk) {
        console.log(rk);
        ch.bindQueue(queue, ex, rk);
      })).then(function() { return queue; });
    });

    ok = ok.then(function(queue) {
      return ch.consume(queue, logMessage, {noAck: true});
    });
    return ok.then(function() {
      console.log(' [*] Waiting for logs. To exit press CTRL+C.');
    });

    function logMessage(msg) {
      console.log(" [x] %s:'%s'",
                  msg.fields.routingKey,
                  msg.content.toString());
    }
  });
}).then(null, console.warn);

*/
function consumer(conn) {
  var ok = conn.createChannel(on_open);
    var ex = 'nova';
    var q = 'notificationsQueue'
  function on_open(err, ch) {
    if (err != null) bail(err);
    ch.assertExchange(ex, 'topic', {durable: false});
    ch.assertQueue(q);
    ch.bindQueue(q,ex,'notification.info')
    ch.consume(q, function(msg) {
      if (msg !== null) {
        var json = JSON.parse(msg.content.toString())
        console.log(json);
        ch.ack(msg);
      }
    });
  }
}

require('amqplib/callback_api')
  .connect('amqp://guest:RABBIT_PASS@controller:5672', function(err, conn) {
    if (err != null) bail(err);
    consumer(conn);
  });











});
