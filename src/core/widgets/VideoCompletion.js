export function normalizeFinishedPercentage(value) {
    if ((typeof value !== 'number' && typeof value !== 'string') ||
        (typeof value === 'string' && value.trim() === '')) {
        return 100;
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return 100;
    }
    return Math.max(1, Math.min(100, Math.round(number)));
}

export default class VideoCompletion {
    constructor() {
        this.finished = false;
    }

    reset() {
        this.finished = false;
    }

    update(currentTime, duration, percentage, ended = false) {
        if (this.finished || !Number.isFinite(duration) || duration <= 0 ||
            !Number.isFinite(currentTime) || currentTime < 0) {
            return false;
        }
        if (!ended && currentTime / duration < normalizeFinishedPercentage(percentage) / 100) {
            return false;
        }
        this.finished = true;
        return true;
    }
}
