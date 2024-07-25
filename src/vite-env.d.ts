/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APP_TITLE: string
    // more env variables...
    VITE_VERSION: string
    VITE_IRONFORGE_API_URL: string
    VITE_IRONFORGE_API_KEY: string
    VITE_IRONFORGE_API_ACCESS_TOKEN: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}