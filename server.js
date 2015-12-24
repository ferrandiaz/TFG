var express         = require("express"),
    app             = express(),
    bodyParser      = require("body-parser");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get('/',function(req,res){
    res.send('Hello World');
});

app.listen(3000, function(){
    console.log('Server Running Port 3000');
});