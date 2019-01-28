
class AsyncTaskExecutor {
    constructor (maxThreads) {
        this._running = [];
        this._pending = [];
        this._tasks = new Map();
        this.maxThreads = maxThreads;
        this._isRunning = false;
    }

    get maxThreads () { return this._maxThreads; }
    set maxThreads (num) {
        this._maxThreads = num < 1 ? 1 : num;
    }

    start () {
        if (this._isRunning) { return; }
        this._isRunning = true;
        let idleCount = this._maxThreads - this._running.length;
        while (idleCount > 0 && this._pending.length > 0) {
            let task = this._pending.shift();
            this._running.push(task);
            this._runTask(task);
            --idleCount;
        }
    }

    stop (clear = false) {
        this._isRunning = false;
        if (clear) {
            this._running.splice(0, this._running.length);
            this._pending.splice(0, this._pending.length);
            this._tasks.clear();
        }
    }

    submit (job, thisArg, ...args) {
        let task;
        args.unshift(thisArg);
        let promise = new Promise((resolve, reject) => {
            task = { resolve, reject, job, params: args };
        });

        this._tasks.set(promise, task);

        if (this._running.length < this.maxThreads && this._isRunning) {
            this._running.push(promise);
            this._runTask(promise);
        } else {
            this._pending.push(promise);
        }
        return promise;
    }

    async _runTask (promise) {
        let task = this._tasks.get(promise);
        try {
            let result = await task.job.call(...task.params);
            task.resolve(result);
        } catch (err) {
            task.reject(err);
        }

        // next
        let idx = this._running.indexOf(promise);
        this._running.splice(idx, 1);
        this._tasks.delete(promise);
        if (this._running.length < this.maxThreads && this._pending.length > 0 && this._isRunning) {
            let tNext = this._pending.shift();
            this._running.push(tNext);
            this._runTask(tNext);
        }
    }

    _remove (promise) {
        if (this._tasks.has(promise) && this._pending.includes(promise)) {
            let task = this._tasks.get(promise);
            let idx = this._pending.indexOf(promise);
            this._pending.splice(idx, 1);
            this._tasks.delete(promise);
            return task;
        }
        return null;
    }

    resolve (promise, reason) {
        let task = this._remove(promise);
        if (!task) return false;
        task.resolve(reason);
        return true;
    }

    reject (promise, reason) {
        let task = this._remove(promise);
        if (!task) return false;
        task.reject(reason);
        return true;
    }
}

module.exports = { AsyncTaskExecutor };
