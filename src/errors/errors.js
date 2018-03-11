var imageNotFound = {
  status: 404,
  message: 'IMAGE NOT FOUND'
};
var flavorNotFound = {
  status: 404,
  message: 'FLAVOR NOT FOUND'
};
var noHypervisorFound = {
  status: 404,
  message: 'No hosts aviable to launch this VM'
}

var noExists = {
  status: 404,
  message: 'Not Exists'
}
exports.imageNotFound = imageNotFound;
exports.flavorNotFound = flavorNotFound;
exports.noHypervisorsFound = noHypervisorFound;
exports.noExists = noExists;
