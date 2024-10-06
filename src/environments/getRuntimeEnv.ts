import type { LooseObject } from 'src/types/LooseObject';

const getRuntimeEnv = (): LooseObject => import.meta.env;

export default getRuntimeEnv;
