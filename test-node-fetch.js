const http = require('http');
console.log('Iniciando fetch...');
const req = http.get('http://pimsweb/PIVision/api/displays/48494', (res) => {
  console.log('Status:', res.statusCode);
}).on('error', console.error);
req.setTimeout(3000, () => {
  console.log('Timeout!');
  req.destroy();
});
