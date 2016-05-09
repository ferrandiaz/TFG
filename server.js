var express = require("express"),
  app = express(),
  bodyParser = require("body-parser"),
  methodOverride = require("method-override");

app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(bodyParser.json());
app.use(methodOverride());

var router = express.Router();
app.get('/', function(req, res) {
  res.send('Hello World');
});
app.use(router);

var listener = require('./listener/listener');
var compute = require('./routes/compute');
var meters = require('./routes/meters');
var alarm = require('./routes/alarm');
var openstack = express.Router();

openstack.route('/server')
  .get(compute.getServers)
  .post(compute.createServer);
openstack.route('/alarm/over/:hypervisor')
  .post(compute.overUsed);
openstack.route('/alarm/under/:hypervisor')
  .post(compute.underUsed);
openstack.route('/sleep/:hypervisor')
  .get(compute.sleepServer);
openstack.route('/sorted/:flavor')
  .get(compute.sorted);
openstack.route('/meters')
  .get(meters.getMeters);
openstack.route('/meters/:meter/:resource')
  .get(meters.getStatistics);
openstack.route('/alarm')
  .get(alarm.getAlarms);
/*openstack.route('/alarm/:type/:hypervisor')
  .get(alarm.alarmNotification);*/
app.use('/openstack', openstack);

listener.listener('notificationsQueue', function(err, msg) {
  console.log("*****************************************************");
  console.log('SERVER.JS MESSAGE');
  console.log(msg);
  console.log("*****************************************************");
});

app.listen(3000, function() {
  console.log('Server Running Port 3000');
});
