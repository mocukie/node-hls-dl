#!/usr/bin/env node

const fs = require('fs');
const cp = require('child_process');
const Stream = require('stream');
const Util = require('util');
const piplineAsync = Util.promisify(Stream.pipeline);

const Commander = require('commander');
const Colors = require('colors');

const packjson = require('../package.json');
const MS = require('./MemoryStream');
const HLSDownloader = require('./HLS-Downloader');

const Utils = require('./Utils');
const to = Utils.to;
const humanBytes = Utils.humanBytes;
const humanDruation = Utils.humanDruation;
const padAlignCenter = Utils.padAlignCenter;

main(process.argv.slice(2));

async function main (argv) {
    process.title = 'HLS-DL';

    const opts = parseOpts();
    const output = opts.output;
    const maxConcurrent = opts['maxConcurrentDownloads'];
    let m3u8Url = opts.m3u8Url;

    try {
        m3u8Url = new URL(m3u8Url);
    } catch (error) {
        return console.log(error.message);
    }

    const dlOpts = { maxConcurrent };

    if (opts['addHeader'].length > 0) { dlOpts.headers = Utils.parseHttpHeaders(opts['addHeader']); }

    const dler = initDownloader(m3u8Url, dlOpts);
    const datas = [];
    dler.on('segment', (data, idx) => datas[idx] = data);
    console.log('Downloading...\n');
    let [err, time] = await dler.start().then(...to);
    if (err) { return console.log(` ${err.message}`); }
    console.log('\n\nDownload all segments in %s', humanDruation(...time).cyan);

    // ffmpeg
    console.log('\nRemux MPEG-TS to mp4 with ffmpeg...');
    let promiseToken = Utils.createPromiseToken();
    const ffmpeg = cp.spawn(
        'ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-stats', '-i', '-', '-c', 'copy', '-f', 'mp4', `${output}.mp4`],
        { stdio: ['pipe', 'pipe', process.stderr] }
    );
    ffmpeg.on('error', e => err = e);
    ffmpeg.stdout.on('close', () => promiseToken.resolve());

    if (!err) {
        await piplineAsync(
            MS.createReadStream(datas),
            ffmpeg.stdin
        ).catch(e => err = err || e);
    }
    await promiseToken;

    if (err) {
        err.code === 'ENOENT' ? console.log(' ffmpeg not found (ENOENT).')
            : console.log(` exec ffmpeg failed (${err.code}), ${err.message}`.magenta);
        console.log(`\nWriting data to a single MPEG-TS file, ${output}.ts`);
        await piplineAsync(
            MS.createReadStream(datas),
            fs.createWriteStream(`${output}.ts`)
        );
    }
    console.log('\ndone.'.green);
}

function initDownloader (m3u8Url, dlOpts) {
    const dler = new HLSDownloader(m3u8Url, dlOpts);
    let total; let padWidth = 3;
    dler.on('m3u8', m => {
        total = m.segments.length;
        padWidth = total.toString().length;
        const a = [
            padAlignCenter('Segments', 10),
            padAlignCenter('Avg Speed', 13),
            padAlignCenter('Downloaded', 13)
        ];
        console.log(' | %s | %s | %s |', a[2], a[1], a[0]);
        console.log(' '.padEnd(47, '-'));
    });
    dler.on('progess', stat => {
        const a = [
            `${stat.downloaded.toString().padStart(padWidth)}/${stat.total}`.padStart(10),
            `${humanBytes(stat.avgSpeed)}/s`.padStart(13),
            humanBytes(stat.recivedBytes).padStart(13)
        ];
        process.stderr.write(Util.format('\r | %s | %s | %s |', a[2].yellow, a[1].yellow, a[0].yellow));
    });
    return dler;
}

function parseOpts () {
    const collect = (val, arr) => {
        arr.push(val);
        return arr;
    };
    const checkInt = (val, old) => isNaN(val) ? old : parseInt(val);
    const fail = msg => Commander.help(help => `${help}\n ${msg}\n`);
    const argv = Commander
        .name(' ')
        .usage(`\n  ${packjson.name} [options] <URL> -o /path/to/output`)
        .option('-o, --output <path>', 'Set the output path without file extension.')
        .option('-j, --max-concurrent-downloads [n]', 'Set the maximum number of parallel downloads.', checkInt, 8)
        .option('    --add-header [FIELD:VALUE]', 'Add a custom HTTP header, you can use this option multiple times.', collect, [])
        .version(`v${packjson.version}`)
        .parse(process.argv);

    argv.m3u8Url = argv.args.shift();
    if (!argv.m3u8Url) { fail('Missing required argument: <URL>'.red); }

    for (const opt of Commander.options) {
        if (!opt.required) continue;
        let key = opt.long || opt.short;
        key = key.substring(2).replace(/-+([a-zA-Z0-9])/g, (match, $1) => $1.toUpperCase());
        if (!(key in argv)) { fail(`Missing required argument: ${opt.flags}`.red); }
    }

    return argv;
}
