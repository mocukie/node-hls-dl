const Crypto = require('crypto');
const EventEmitter = require('events');
const pipelineAsync = require('util').promisify(require('stream').pipeline);

const M3u8Parser = require('m3u8-parser').Parser;
const Rq = require('./rq');
const AsyncTaskExecutor = require('./AsyncTaskExecutor').AsyncTaskExecutor;
const { to } = require('./Utils');
const MS = require('./MemoryStream');

const NS_PER_SEC = 1e9;

class HLSDownloader extends EventEmitter {
    constructor (url, options = {}) {
        super();
        this.baseUrl = url instanceof URL ? url : new URL(url);
        this.executor = new AsyncTaskExecutor(options.maxConcurrent || 8);
        this._keyFileCache = new Map();
        this._avgSpeed = 0;
        this._recivedByteLength = 0;
        this._downloadedCount = 0;
        let headers = options.headers || {};
        headers['Accept-Encoding'] = 'gzip';
        this.Rq = Rq.wrap({ headers });
    }

    async start () {
        this._startTime = process.hrtime();

        let [err, m3u8] = await this.Rq.get(this.baseUrl.href).text().then(...to);
        if (err) {
            if (err.statusCode !== undefined) { err.message = `StatusCodeError: ${err.statusCode}`; }
            err.message = `Download failed, ${err.message}`;
            throw err;
        }

        const parser = new M3u8Parser();
        parser.push(m3u8);
        parser.end();
        m3u8 = parser.manifest;
        if (!m3u8.segments || m3u8.segments.length === 0) { throw new Error('Parse failed, Invalid m3u8 list.'); }
        this._m3u8 = m3u8;
        this.emit('m3u8', m3u8);

        const pending = [];
        for (const [idx, segment] of m3u8.segments.entries()) {
            pending.push(
                this.executor.submit(this._oneSegment, this, segment)
                    .then(data => this.emit('segment', data, idx, segment))
                    .catch(err => this.emit('error', err, idx, segment))
            );
        }
        this.executor.start();
        await Promise.all(pending);

        const elTime = process.hrtime(this._startTime);
        this.stop();
        this.emit('finished', elTime);
        return elTime;
    }

    stop () {
        this._avgSpeed = 0;
        this._recivedByteLength = 0;
        this._downloadedCount = 0;
        this._startTime = null;
        this.executor.stop(true);
    }

    async _oneSegment (segment) {
        const url = new URL(segment.uri, this.baseUrl);
        const resp = await this.Rq(url);
        const w = MS.createWriteStream();
        const pipeline = [ resp ];

        if (segment.key) { pipeline.push(await this._createDecipher(segment.key)); }
        pipeline.push(w);

        resp.on('data', chunk => {
            this._calcSpeed(chunk.byteLength);
            this._emitProgess();
        });
        await pipelineAsync(...pipeline);

        this._downloadedCount++;
        this._emitProgess();
        return w.data();
    }

    async _createDecipher (keyObj) {
        const url = new URL(keyObj.uri, this.baseUrl);
        const iv = keyObj.iv || new Uint32Array(4);
        const keyFile = await this._fetchKey(url);
        return Crypto.createDecipheriv('aes-128-cbc', keyFile, iv);
    }

    async _fetchKey (url) {
        const keyFile = this._keyFileCache.get(url.href);
        if (keyFile instanceof Promise) { return await keyFile; } else if (keyFile) { return keyFile; }

        const p = this.Rq.get(url).result().then(ret => {
            this._keyFileCache.set(url.href, ret);
            return ret;
        });
        this._keyFileCache.set(url.href, p);
        return await p;
    }

    _calcSpeed (dataByteLength) {
        const el = process.hrtime(this._startTime);
        this._recivedByteLength += dataByteLength;
        this._avgSpeed = this._recivedByteLength / (el[0] + el[1] / NS_PER_SEC);
    }

    _emitProgess () {
        this.emit('progess', {
            avgSpeed: this._avgSpeed,
            recivedBytes: this._recivedByteLength,
            downloaded: this._downloadedCount,
            total: this._m3u8.segments.length
        });
    }
}

module.exports = HLSDownloader;
