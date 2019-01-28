const humanFormat = require('human-format');

module.exports.humanBytes = function (bytes, decimals = 2) {
    const { prefix, value: v } = humanFormat.raw(bytes, { scale: 'binary', decimals });
    return `${v.toFixed(decimals)} ${prefix}B`;
};

const timeScale = {
    d: 1 * 60 * 60 * 24,
    h: 1 * 60 * 60,
    m: 1 * 60,
    s: 1
};

module.exports.humanDruation = function (s, ns = 0, options = {}) {
    const dp = options.decimals || 2;
    const sp = options.separator || ' ';

    if (ns) { s += ns / 1e9; }
    const ret = [];
    for (const [u, scale] of Object.entries(timeScale)) {
        if (scale === 1) {
            ret.push(`${s.toFixed(dp)}${u}`);
            break;
        }
        if (s < scale && ret.length === 0) continue;
        ret.push(`${Math.floor(s / scale)}${u}`);
        s %= scale;
    }
    return ret.join(sp);
};

module.exports.to = [r => [null, r], e => [e]];

module.exports.createPromiseToken = function () {
    let resolve, reject;
    const p = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    p.resolve = resolve;
    p.reject = reject;
    return p;
};

module.exports.parseHttpHeaders = function (strOrArray) {
    if (!strOrArray) return {};
    const headers = {};
    const lines = Array.isArray(strOrArray) ? strOrArray : strOrArray.split(/\r?\n/g);
    for (const line of lines) {
        if (!line) continue;
        const i = line.indexOf(':');
        const name = line.substring(0, i).trim();
        if (!name) continue;
        const value = line.substring(i + 1).trim();

        headers[name] = value;
    }
    return headers;
};

module.exports.padAlignCenter = function (str, targetWidth, padStr = ' ') {
    if (targetWidth === str.length) return str;
    const s = Math.ceil((targetWidth + str.length) / 2);
    return str.padStart(s, padStr).padEnd(targetWidth, padStr);
};
