import type { LooseObject } from "/types/LooseObject";

const getRuntimeEnv = (): LooseObject => import.meta.env;

export default getRuntimeEnv;