var express = require("express"),
    app = express(),
    bodyParser = require("body-parser"),
    methodOverride = require("method-override");

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(methodOverride());

var router = express.Router();
app.get('/', function (req, res) {
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
openstack.route('/meters')
    .get(compute.getHosts);

app.use('/openstack', openstack);

require('amqplib/callback_api')
    .connect('amqp://openstack:openstack@controller:5672//', function (err, conn) {
        if (err != null) console.log(err);
        consumer(conn);
    });

function consumer(conn) {
    var ok = conn.createChannel(on_open);
    var ex = 'nova';
    var q = 'notificationsQueue';

    function on_open(err, ch) {
        if (err != null) console.log(err);
        ch.assertExchange(ex, 'topic', {durable: false});
        ch.assertQueue(q);
        ch.bindQueue(q, ex, 'notifications.info');
        ch.consume(q, function (msg) {
            if (msg !== null) {
                var json = JSON.parse(msg.content.toString());
                _.each(json, function (ms) {
                    var jMS = JSON.parse(ms);
                    if (jMS.event_type === 'compute.instance.create.end') {
                        console.log('Created ' + jMS.event_type);
                    }
                    if (jMS.event_type === 'compute.instance.delete.end') {
                        console.log('Deleted ' + jMS.event_type);
                    }
                });
                ch.ack(msg);
            }
        });
    }
}

app.listen(3000, function () {
    console.log('Server Running Port 3000');
});
