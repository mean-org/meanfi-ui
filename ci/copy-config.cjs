const fs = require('fs-extra');

const buildOutputPath = './build/';
const buildEnvironment = process.env.NODE_ENV;

console.log('Running post-build script...\n');
console.log('Build environment:', buildEnvironment);

if (fs.existsSync(buildOutputPath + 'web.config')) {
  fs.unlinkSync(buildOutputPath + 'web.config');
}

console.log('Copying file:', 'web.config');

fs.copySync('./ci/src-web.config', buildOutputPath + 'web.config');
