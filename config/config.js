//Openstack Client Options
var options = {
  provider: 'openstack',
  username: 'admin',
  password: 'telematica',
  tenantId: '29f1fabbe7504b34a6fc1037793cbe52',
  region: 'regionOne',
  authUrl: 'http://controller:35357',
  strictSSL: false
}

//MAX and MIN CPU USAGE
var maxCPU = 60;
var minCpu = 10;

//ALARM Options
var alarmOptions = {
  alarm_actions: 'http://controller:3000/openstack/alarm/',
  severity: 'critical',
  meter_name: 'compute.node.cpu.percent',
  evaluation_periods: 3,
  period: 60,
  statistic: 'avg',
  type: 'threshold'
}

exports.maxCPU = maxCPU;
exports.minCPU = minCpu;
exports.options = options;
exports.alarmOptions = alarmOptions;
