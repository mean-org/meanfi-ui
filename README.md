# PLEASE READ: This repo is now a public archive

If you want run the Meanfi UI, feel free to clone or fork this repo.

See Agave, the Solana validator implementation from Anza: https://github.com/anza-xyz/agave

---

# MeanFi UI - Front end for Mean Finance

## Stack

The project structure is a dedicated repository based in the following stack technologies:
- React 18 framework
- Vite
- Typescript
- Biome.js linter and code formatter
- Ant Design UI
- Node JS version requirement >= 18
- Yarn Package manager

## Setup

Clone the repo to a local folder then run:

```sh
yarn install
yarn run start:dev
```

The local development server runs on port 3000 but it can be changed in the `vite.config.ts` configuration file.

Build for different targets

```sh
yarn run build:prod
yarn run build:dev
```

You can test the app by serving files from the build at port 8080

```sh
yarn run preview
```

You can also change the port to serve your build files initially configured to port 8080 in the `vite.config.ts`.
