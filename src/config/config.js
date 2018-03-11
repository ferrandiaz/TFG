//Openstack Client Options

var env = process.env;

var options = {
  provider: 'openstack',
  username: env.USER,
  password: env.PASSWORD,
  tenantId: env.TENANT_ID,
  region: env.REGION,
  authUrl: env.AUTH_URL,
  strictSSL: false
}

//MAX and MIN CPU USAGE
var maxCPU = 60;
var minCpu = 10;

//ALARM Options
var alarmOptions = {
  alarm_actions: env.ALARM,
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
