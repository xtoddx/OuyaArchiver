var apps = require("./apps.json");
var request = require('request-promise-native');
var fs = require('fs');
var path = require('path');
var url = require('url');
const asyn = require('async');
const { DownloaderHelper } = require('node-downloader-helper');
const filenamify = require('filenamify');
var argv = require('minimist')(process.argv.slice(2), {
    alias: { h: 'help', t: "threads", a: "apk,", p: "premium", f: "fresh" },
    default: { t: '5' },
});
let archive = {};
if (fs.existsSync("archive.json")) {
    archive = JSON.parse(fs.readFileSync("archive.json"));
}

const getApps = async () => {
    try {
        return await request.get('https://devs.ouya.tv/api/v1/apps');
    } catch (error) {
        throw error
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getApkLink(app) {
    let downloadLink

    try {
        downloadLink = await request.get("https://devs.ouya.tv/api/v1/apps/" + app.uuid + "/download");

        downloadLink = JSON.parse(downloadLink).app.downloadLink
        const uri = url.parse(downloadLink)
        const filename = path.basename(uri.path)

        return [downloadLink, filename];

    } catch (error) {
        console.error("Error downloading the " + app.title + " APK")
        throw error
    }
}

async function downloadScreenshots(app) {
    let appJSON
    const appTitle = await filenamify(app.title, { replacement: '_' });

    try {
        appJSON = await request.get("https://devs.ouya.tv/api/v1/apps/" + app.uuid);
    } catch (error) {
        console.log('XXX error in requesting app json for ', app.title)
        throw error
    }

    let screenshots = JSON.parse(appJSON).app.filepickerScreenshots
    console.log("screenshots: ", screenshots)
    for (scr in screenshots) {
        console.log("screen ", scr)
        await download(screenshots[scr], "./downloads/" + appTitle + "/screenshots", "screenshot" + scr + ".jpg")
    }

}

function download(link, path, filename) {
    console.log(" -> asked to download ", link, " to filename ", filename, " at path ", path)
    return new Promise(async (resolve, reject) => {

        try {
            fs.stat(path, (err, st) => {
                if (err) {
                    fs.mkdirSync(path, { recursive: true }, (err) => {
                        console.log("!!!! error in mkdirSync");
                        if (err) throw err;
                    });
                }
            })

            const dl = new DownloaderHelper(link, path, { fileName: filename, override: true });

            dl.on('end', () => {
                resolve();
            })

            dl.on('error', (err) => {
            })

            await dl.start();

        } catch (error) {

            console.error("Error downloading " + link)
            console.log(error);
            reject(error);

        }
    })
}



async function main() {

    if (argv.f) apps = JSON.parse(await getApps());

    const limit = argv.t;

    asyn.eachOfLimit(apps.apps, limit, async (app, key, cb) => {
        if ((app.premium == false || argv.p) && !archive[app.uuid]) {
            console.log("Downloading: " + app.title + " (" + (key + 1) + "/" + apps.apps.length + ")");
            try {
                const appTitle = await filenamify(app.title, { replacement: '_' });
                console.log("XXX title: ", appTitle)
                if (!argv.a) {
                    console.log("XXX downloading info.json for ", app.title)
                    await download("https://devs.ouya.tv/api/v1/apps/" + app.uuid, "./downloads/" + appTitle, "info.json")
                    if (app.mainImageFullUrl != null) {
                        console.log("getting main image for ", app.title)
                        await download(app.mainImageFullUrl, "./downloads/" + appTitle, "mainImage.png")
                    }
                    if (app.heroImage != null) {
                        console.log("downloading hero image for ", app.title)
                        await download(app.heroImage, "./downloads/" + appTitle, "heroImage.jpg")
                    }
                    await downloadScreenshots(app)
                }

                if (app.premium == false) {
                    var [downloadLink, filename] = await getApkLink(app).then(new Error());
                    console.log("about to download to ./downloads/"+appTitle+"/"+filename+" from " + downloadLink)
                    await download(downloadLink, "./downloads/" + appTitle + "/", filename).then(() => {
                        cosole.log("archived ", app.uuid)
                        archive[app.uuid] = true;
                        fs.writeFileSync("archive.json", JSON.stringify(archive));
                    })

                } else {
                    console.log("skipping premium app")
                    archive[app.uuid] = true;
                    fs.writeFileSync("archive.json", JSON.stringify(archive));
                }
            } catch (error) { console.log(error.message) }
        } else { }
    }, (err) => {
        console.error(err)
    })

}

if (argv.h) {
    console.log(`
    OuyaArchiver v1.1

    Options:
        -t x, --threads x  set number of threads to x (default: 5)
        -a, --apk          only download the APKs
        -f, --fresh        use app list from the web, instead of the included one (adds a delay when starting)
        -p, --premium      additionally downloads the info and screenshots of premium games, but not the APKs
        -h, --help         print usage information
    `)
} else {
    main();
}
