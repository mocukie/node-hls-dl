
if (require.main === module) {
    require('./cli');
} else {
    module.exports = {
        HLSDownloader: require('./HLS-Downloader')
    };
}
