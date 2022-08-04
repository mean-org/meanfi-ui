const fs = require('fs-extra');

const buildOutputPath = './build/';
const buildEnvironment = process.env.REACT_APP_ENV;

console.log('Running post-build script...\n');
console.log('Build environment:', buildEnvironment);

if (fs.existsSync(buildOutputPath + 'web.config')) {
    fs.unlinkSync(buildOutputPath + 'web.config');
}

if (fs.existsSync(buildOutputPath + 'robots.txt')) {
    fs.unlinkSync(buildOutputPath + 'robots.txt');
}

console.log('Copying file:', 'web.config');

fs.copySync('./ci/web.config', buildOutputPath + 'web.config');

console.log('Copying file:', 'robots.txt');

if (buildEnvironment === 'production') {
    fs.copySync('./ci/robots_allow.txt', buildOutputPath + 'robots.txt');
} else {
    fs.copySync('./ci/robots_disallow.txt', buildOutputPath + 'robots.txt');
}
