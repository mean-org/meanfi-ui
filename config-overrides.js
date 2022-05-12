/* eslint-disable @typescript-eslint/no-var-requires */
const webpack = require("webpack");

module.exports = function (config, env) {
    return {
        ...config,
        module: {
            ...config.module,
            rules: [
                ...config.module.rules.map(rule => {
                    if (rule.oneOf instanceof Array) {
                      rule.oneOf[rule.oneOf.length - 1].exclude = [/\.(js|mjs|jsx|cjs|ts|tsx)$/, /\.html$/, /\.json$/];
                    }
                    return rule;
                  }),
                {
                    test: /\.(m?js|ts)$/,
                    enforce: 'pre',
                    use: ['source-map-loader'],
                },
                {
                    test: /\.m?js/,
                    resolve: {
                        fullySpecified: false
                    }
                },
            ],
        },
        resolve: {
            ...config.resolve,
            fallback: {
                assert: require.resolve('assert'),
                buffer: require.resolve('buffer'),
                fs: require.resolve("graceful-fs"),
                stream: require.resolve('stream-browserify'),
                constants: require.resolve("constants-browserify"),
                url: require.resolve('url'),
                // http: require.resolve("stream-http"),
                // zlib: require.resolve("browserify-zlib"),
                // https: require.resolve("https-browserify"),
                crypto: false,
                https: false,
                http: false,
                zlib: false,
                path: false,
                os: false,
            },
        },
        plugins: [
            ...config.plugins,
            new webpack.ProvidePlugin({
                process: "process/browser",
                Buffer: ["buffer", "Buffer"],
            }),
            new webpack.NormalModuleReplacementPlugin(/node:/, (resource) => {
                const mod = resource.request.replace(/^node:/, "");
                switch (mod) {
                    case "buffer":
                        resource.request = "buffer";
                        break;
                    case "stream":
                        resource.request = "readable-stream";
                        break;
                    default:
                        throw new Error(`Not found ${mod}`);
                }
            }),
        ],
        ignoreWarnings: [/Failed to parse source map/],
    };
};
