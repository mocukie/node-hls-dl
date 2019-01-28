
const zlib = require('zlib');
const Stream = require('stream');
const piplineAsync = require('util').promisify(Stream.pipeline);

const MS = require('./MemoryStream');
const protocols = {
    'http:': require('follow-redirects').http,
    'https:': require('follow-redirects').https
};

class Response extends Stream.Readable {
    constructor (resp) {
        super();
        this.incomingMessage = resp;
        this.receivedBodyLength = 0;
        const errCb = () => this.emit('error', ...arguments);
        resp.on('error', errCb)
            .on('aborted', () => this.emit('aborted', ...arguments))
            .on('data', chunk => this.receivedBodyLength += chunk.byteLength)
            .pipe(this._createDecoder())
            .on('error', errCb)
            .on('data', chunk => {
                if (!this.push(chunk)) { this.incomingMessage.pause(); }
            })
            .on('end', () => {
                const contentLength = this.headers['content-length'];
                if (contentLength && parseInt(contentLength) !== this.receivedBodyLength) {
                    return this.emit('error', new Error('Validate Content-Length failed'));
                }
                this.push(null);
            });

        this.on('end', () => this.bodyUsed = true);
    }

    _read (size) {
        this.incomingMessage.resume();
    }

    _createDecoder () {
        return /(?:gzip|deflate)/i.test(this.headers['content-encoding']) ? zlib.createUnzip() : new Stream.PassThrough();
    }

    async body () {
        if (this.bodyUsed) return null;
        const w = MS.createWriteStream();
        await piplineAsync(
            this,
            w
        );
        return w.data();
    }

    async text (encoding = 'utf8') {
        if (this.bodyUsed) return null;
        return (await this.body()).toString(encoding);
    }

    async json (encoding = 'utf8') {
        if (this.bodyUsed) return null;
        return JSON.parse(await this.text(encoding));
    }

    _destroy (err, callback) {
        this.incomingMessage.destroy(err);
        if (err) { callback(err); }
    }

    setTimeout (msecs, callback) {
        return this.incomingMessage.setTimeout(msecs, callback);
    }
}

[
    'aborted',
    'complete',
    'headers',
    'httpVersion',
    'httpVersionMajor',
    'httpVersionMinor',
    'statusCode',
    'statusMessage',
    'url',
    'req',
    'responseUrl',
    'redirects'
].forEach(p => {
    Object.defineProperty(Response.prototype, p, {
        enumerable: true,
        get: function () {
            return this.incomingMessage[p];
        }
    });
});

class Requset {
    constructor (url, options = {}) {
        this._promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
        if (!(url instanceof URL)) url = new URL(url);
        const req = protocols[url.protocol].request(url, options);
        this.req = req;
        req.on('response', resp => {
            resp = new Response(resp);
            this.resp = resp;
            if (resp.statusCode >= 400 && resp.statusCode < 600) {
                resp.text().then(text => {
                    const err = new Error(`${resp.statusCode} | ${text}`);
                    err.statusCode = resp.statusCode;
                    err.name = 'StatusCodeError';
                    this._reject(err);
                });
            } else {
                this._resolve(resp);
            }
        });

        req.on('error', err => {
            this._reject(err);
        });

        if (options.body) {
            if (!(options.body instanceof Uint8Array) && typeof options.body === 'object') options.body = JSON.stringify(options.body);
            req.end(options.body);
        } else {
            req.end();
        }
    }

    then () {
        return this._promise.then(...arguments);
    }

    catch () {
        return this._promise.catch(...arguments);
    }

    result () {
        return this.then(resp => resp.body());
    }

    text () {
        return this.then(resp => resp.text());
    }

    json () {
        return this.then(resp => resp.json());
    }
}

function request (url, options = {}) {
    return new Requset(url, options);
}

function wrapFn (origFn, options) {
    return function (url, opts = {}) {
        let target = {};
        Object.assign(target, options, opts);
        return origFn(url, target);
    };
}

function createAlias (rq) {
    ['get', 'head', 'post', 'put', 'delete', 'trace', 'options', 'connect', 'patch'].forEach(m => {
        rq[m] = function (url, options = {}) {
            options.method = m.toUpperCase();
            return rq(url, options);
        };
    });
}
createAlias(request);

request.wrap = function (options) {
    if (!options) throw new Error('Invalid options.');
    let newRq = wrapFn(request, options);
    createAlias(newRq);
    return newRq;
};

module.exports = request;
