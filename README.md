HLS-DL 
===============
A simple cli hls downlodader that
download all segments in memory, and then remux to mp4 with ffmpeg (if found).

    Usage:
        hls-dl [options] <URL> -o /path/to/output

    Options:  
        -o, --output <path>                 Set the output path   without file extension.
        -j, --max-concurrent-downloads [n]  Set the maximum number of parallel downloads. (default: 8)
        --add-header [FIELD:VALUE]          Add a custom HTTP header, you can use this option multiple times. (default: [])
        -V, --version                       output the version number
        -h, --help



