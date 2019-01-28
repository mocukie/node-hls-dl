const Stream = require('stream');

class MemoryReadStream extends Stream.Readable {
    constructor (buffers, options = {}) {
        options.objectMode = false;
        super();
        this._buffers = buffers;
    }

    _read (size) {
        try {
            while (this.push(this._buffers.shift() || null));
        } catch (err) {
            process.nextTick(() => this.emit('error', err));
        }
    }
}

class MemoryWriteStream extends Stream.Writable {
    constructor (options = {}) {
        options.objectMode = false;
        options.decodeStrings = true;
        super(options);
        this._options = options;
        this._chunks = [];
        this._length = 0;
    }

    _write (chunk, encoding, callback) {
        try {
            this._chunks.push(chunk);
            this._length += chunk.length;
            callback();
        } catch (err) {
            callback(err);
        }
    }

    _destroy (err, cb) {
        this._length = -1;
        this._chunks = null;
        cb(err);
    }

    get length () {
        return this._length;
    }
    get destroyed () {
        return !this._chunks || this._length < 0;
    }

    data (destroyAndEnd = true) {
        if (this.destroyed) return null;
        const ret = Buffer.alloc(this._length);
        let position = 0;
        let chunk;
        while (chunk = this._chunks.shift()) {
            chunk.copy(ret, position);
            position += chunk.length;
        }
        if (!destroyAndEnd) { return ret; }
        this.end();
        this.destroy();
        return ret;
    }
}

// slower than MemoryWriteStream
class MemoryWriteStreamSingleBuffer extends Stream.Writable {
    constructor (options = {}) {
        options.objectMode = false;
        options.decodeStrings = true;

        if (!options.initSize || options.initSize <= 0) { options.initSize = Buffer.poolSize; }
        super(options);
        this._options = options;
        this._data = Buffer.alloc(options.initSize);
        this._position = 0;
    }

    _write (chunk, encoding, callback) {
        try {
            if (this.writableLength > this._data.length - this._position) { this._createNewBuffer(chunk.length); }
            chunk.copy(this._data, this._position);
            this._position += chunk.length;
            callback();
        } catch (err) {
            callback(err);
        }
    }

    _createNewBuffer (chunkLength) {
        const newLength = this._data.length + chunkLength + Math.ceil(this.writableLength * 1.5);
        const old = this._data;
        this._data = Buffer.alloc(newLength);
        old.copy(this._data, 0, 0, this._position);
    }

    _destroy (err, cb) {
        this._data = null;
        this._position = -1;
        cb(err);
    }

    get destroyed () {
        return !this._data || this._position < 0;
    }

    data () {
        if (this.destroyed) return null;
        const ret = Buffer.from(this._data.buffer, this._data.byteOffset, this._position);
        this.end();
        this.destroy();
        return ret;
    }
}

/**
 *
 * @param {Buffer[] | Buffer} buffers
 */
exports.createReadStream = function (buffers, options = {}) {
    if (!Array.isArray(buffers)) { buffers = [ buffers ]; } else { buffers = buffers.slice(); }

    return new MemoryReadStream(buffers, options);
};

exports.createWriteStream = function (options = {}) {
    return new MemoryWriteStream(options);
};
