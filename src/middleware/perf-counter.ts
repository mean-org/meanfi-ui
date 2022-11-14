export class PerformanceCounter {
    private _timeLapseStart: number;
    private _timeLapseStop: number;
    private _elapsedTime: number;

    constructor() {
        this._elapsedTime = 0;
        this._timeLapseStart = 0;
        this._timeLapseStop = 0;
    }

    public reset() {
        this._elapsedTime = 0;
        this._timeLapseStart = 0;
        this._timeLapseStop = 0;
    }

    public start() {
        this._timeLapseStart = performance.now();
    }

    public stop() {
        this._timeLapseStop = performance.now();
        this._elapsedTime = this._timeLapseStop - this._timeLapseStart;
    }

    public get elapsedTime(): number {
        return this._elapsedTime;
    }

}
