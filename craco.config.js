const CracoLessPlugin = require("craco-less");

module.exports = {
  plugins: [
    {
      plugin: CracoLessPlugin,
      options: {
        lessLoaderOptions: {
          lessOptions: {
            modifyVars: { "@primary-color": "#B7001C" },
            javascriptEnabled: true,
          },
        },
      },
    },
  ],
  eslint: {
    mode: "file",
    enable: false
  }
};
