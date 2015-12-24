var express         = require("express"),
    app             = express(),
    bodyParser      = require("body-parser");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
var router = express.Router();
app.get('/',function(req,res){
    res.send('Hello World');
});
app.use(router);


var compute = require('./routes/compute');

var openstack = express.Router();

openstack.route('/server')
    .get(compute.getServers);

app.use('/openstack',openstack);

app.listen(3000, function(){
    console.log('Server Running Port 3000');
});