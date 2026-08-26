const { execFile } = require('child_process');
const targetUrl = 'http://10.247.72.34/PIVision/Displays/48494/OpenEditDisplay';
const curlArgs = ['-s', '-D', '-', '--noproxy', '*', '--ntlm', '-u', 'Administrator:AperamSrvpims', targetUrl];
execFile('curl', curlArgs, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
  console.log("Error:", error);
  console.log("Stdout starts with:", stdout.substring(0, 100));
});
