import { connect } from "puppeteer-real-browser";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
// import FingerprintProtector from './soyjak-fingerprinter.mjs';
import MargeService from "./MargeService.mjs";
// import { newInjectedPage } from 'fingerprint-injector';
import { createCursor } from 'ghost-cursor'; // Simulates realistic human mouse movement.


import axios from 'axios'; // for the localhost usage LOL, yes I think this is very funny OY VEY LOL HAHAHA .. NIGGER FUNNY LOL
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

//create a database keep track of the accounts

function makeid(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}
async function checkStatus(taskId) {
    try {
        const response = await axios.get('http://localhost:3000/api/queue', {
            params: { task_id: taskId },
        });

        const data = response.data; // ✅ Axios auto-parses JSON

        if (data.success) {
            return data;
        }

        // Task missing → treat as completed (worker removed)
        if (data.error === 'Task not found') {
            return { status: 'completed', task_id: taskId };
        }

        throw new Error(data.error || 'Unknown error');
    } catch (err) {
        console.error('checkStatus error:', err.message);
        throw err;
    }
}


async function pollStatus(taskId, intervalMs = 2000, maxAttempts = 90) {
    let attempts = 0;

    return new Promise((resolve, reject) => {
        const poll = async () => {
            attempts++;
            try {
                const status = await checkStatus(taskId);

                console.log(`[${attempts}] Status: ${status.status}`);

                if (status.status === 'completed' || status.status === 'done') return resolve(status);
                if (status.status === 'failed' || status.status === 'error') return reject(new Error('Task failed'));
                if (attempts >= maxAttempts) return reject(new Error('Max polling attempts reached'));

                setTimeout(poll, intervalMs);
            } catch (err) {
                reject(err);
            }
        };

        poll();
    });
}



// new axios-based getWorkerQueue()
async function getWorkerQueue(result) {
    try {
        const data = JSON.parse(result.body);
        const base64Image = data.base64Image;
        const guid = data.guid;

        const response = await axios.post(
            "http://localhost:3000/api/queue",
            {
                image: base64Image,
                submittedBy: "James",
            },
            {
                headers: {
                    "accept": "*/*",
                    "content-type": "application/json",
                    "cache-control": "no-cache",
                    "pragma": "no-cache",
                    "referer": "http://localhost:3000/",
                },
                withCredentials: true,
            }
        );

        let body = response.data;
        if (typeof body === "string") {
            try {
                body = JSON.parse(body);
            } catch {
                // leave as text
            }
        }

        // ✅ return both API response body and guid
        return { ...body, guid };
    } catch (error) {
        console.error("Error in getWorkerQueue:", error.message);
        return {
            status: error.response?.status || 0,
            ok: false,
            body: error.response?.data || error.message,
        };
    }
}


///////////////////////////////////////////////

async function test() {
    let browser = null;
    let page = null;
    // const jihad = await (await import('puppeteer-extra-plugin-stealth')).default
    // const pajeet = await (await import('puppeteer-with-fingerprints')).default

    const jshelterPath = path.join(__dirname, 'jsrestrictor-0.21');

    try {
        //Hard modify 
        // intercept xhr.js , and remove tinytimeouts lol
        // chrome --timezone=Asia/Hong_Kong --lang=zh-CN --accept-lang=zh-CN,en --  =121e0opwlltx  --user-data-dir=./my_user_data 

        const connection = await connect({
            headless: false,
            plugins: [
                // pajeet()
            ],
            args: [
                '--lang=en-US', // sets the browser language to English,
                '--accept-lang=en-US,en',
                // '--disable-webrtc',                  // Not always reliable

                // `--disable-extensions-except=${jshelterPath}`,
                // `--load-extension=${jshelterPath}`,
                '--no-sandbox',
                // '--disable-gpu',
                // '--aggressive-cache-discard',
                // '--disable-site-isolation-trials',
                // '--disable-gpu-sandbox',


                // '--disable-features=WebRtcHideLocalIps', // Hide local IPs
                // '--disable-ip-handling-policy',      // Force proxy-only IPs
                // '--disable-blink-features=TimezoneDetection',
                // '--webrtc-ip-handling-policy=disable_non_proxied_udp',
                // '--force-webrtc-ip-handling-policy',
                // '--disable-speech-api',
                '--fingerprint='+(Math.floor(Math.random() * 0x100000000)).toString(),
                '--fingerprint-platform=windows',
                '--timezone=America/New_York',
                '--cpucores=6',
                '--fingerprint-gpu-vendor',
                // '--port_whitelist=[61255,1080]',11044572221bdad7a80b384f9690e475d6decb7ea35fac146ddd0301cd259e3f

                // '--utility-sub-type=storage.mojom.StorageService',
                // '--type=utility',
                // '--service-sandbox-type=service',
                // '--no-pre-read-main-dll',
                // '--window-position=0,0',
                '--enable-features=AllowURNsInIframes,BrowsingTopics,ConversionMeasurement,FencedFrames,Fledge,FledgeNegativeTargeting,InterestGroupStorage,OverridePrivacySandboxSettingsLocalTesting,PrivacySandboxAdsAPIsOverride,PrivateAggregationApi,SharedStorageAPI',
                '--disable-features=ChromeWhatsNewUI,ExtensionsToolbarMenu,LensOverlay,PrintCompositorLPAC,ReadLater,TriggerNetworkDataMigration,ViewportHeightClientHintHeader',
                // '--mojo-platform-channel-handle=2836',
                // '/prefetch:8',
                // '--use-fake-ui-for-media-stream',
                // '--use-fake-device-for-media-stream',
            ],
            // customConfig: { chromePath: `C:\\Users\\User\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe` },
// "C:\Users\User\AppData\Roaming\adspower_global\cwd_global\chrome_138\sunbrowser.exe" -
            // customConfig: { chromePath: `C:\\Users\\User\\AppData\\Roaming\\adspower_global\\cwd_global\\chrome_138\\sunbrowser.exe` },
            // customConfig: { chromePath: `C:\\Users\\User\\AppData\\Local\\Chromium\\Application\\chrome.exe` },
            customConfig: { chromePath: `C:\\Users\\User\\mlx\\deps\\mimic_140.3\\chrome.exe` },
            // :\Users\User\mlx\deps\mimic_140.3\chrome.exe
            turnstile: false,
            connectOption: {},
            disableXvfb: true,
            ignoreAllFlags: false,
            // proxy: {
            //     host: '15.204.151.143',
            //     port: '31158',
            //     username: '',
            //     password: ''
            // }
        });

        browser = connection.browser;
        page = connection.page;
        const cursor = createCursor(page); // Attach the ghost cursor for human-like interaction.


        // page = await newInjectedPage(browser, {//rest in piss, now detected
        //     fingerprintOptions: {
        //         devices: ['desktop'],
        //         operatingSystems: ['windows'],
        //         slim: true,
        //         mockWebRTC: false,
        //     },
        // });


        // const protector = new FingerprintProtector();
        // await protector.protectPage(page);

        await page.setRequestInterception(true);

        page.on('request', request => {
            try {
                let url = request.url();

                if (
                    url.includes('hash-wasm@')
                        // || url.includes('voice_room_data.php')
                    //     // // || url.includes('STATUS_data') // now detected?
                        // || url.includes('ruffle.js')
                        // || url.includes('_expand-video.js')
                        // || url.includes('.css')
                        // || url.includes('b3.php')
                ) {
                    console.log('Blocked request:', url);
                    return request.abort();
                }

                if (request.resourceType() === 'image') {
                    return request.abort();
                }

                if (request.method() === 'POST') {
                    if (request.postData()) {
                        if (url.includes('/post.php')) {
                            // console.log('POST data:', request.postData());
                        }
                    }
                }

                request.continue();

            } catch (err) {
                try { request.continue(); } catch (_) { }
            }
        });
        // await page.setViewport({ width: 1000, height: 1080 });
        // const timezones = Intl.supportedValuesOf('timeZone');
        // const randomTZ = timezones[Math.floor(Math.random() * timezones.length)];
        // await page.emulateTimezone("America/New_York");
        // await page.emulateTimezone("Europe/Prague");
        // await page.emulateTimezone(randomTZ);

        // Optional: set Accept-Language in request headers
        // await page.setExtraHTTPHeaders({
        //     'Accept-Language': 'en-US,en;q=0.9'
        // });
        // await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0')
        https://browserleaks.com/webgl
        // await page.goto("https://fv.pro/",{ timeout: 60022222});await sleep(30022222);
        // await page.goto("https://browserleaks.com/webgl",{ timeout: 60022222});await sleep(30022222);
// /        // await page.goto("https://abrahamjuliot.github.io/creepjs",{ timeout: 60022222});await sleep(30022222);
        // await page.goto("https://bot-detector.rebrowser.net/",{ timeout: 60022222});await sleep(30022222);
        // await page.goto("https://webbrowsertools.com/canvas-fingerprint/",{ timeout: 60022222});await sleep(30022222);

        // await page.goto("https://soyjak.st/",{ waitUntil: ['load', 'domcontentloaded', 'networkidle0'] });
        // await page.goto("https://soyjak.st/challenge-check.html");
        await page.goto("https://soyjak.st/challenge.html");
        const service = new MargeService();

        await service.solvePowIfNeeded(page);
        await page.goto("https://soyjak.st/soy/",
        );
        // await sleep(8000);

        await page.waitForSelector('textarea#body');

        // await page.evaluate(() => {
        //     const btn = document.querySelector('#show-captcha-button');
        //     if (btn) btn.click();
        // });
        cursor.click('#show-captcha-button')


        const initialGuid = await page.$eval('#captcha_guid', el => el.value);
        await page.waitForFunction(prev => {
            const input = document.querySelector('#captcha_guid');
            return input && input.value && input.value !== prev;
        }, { timeout: 30000 }, initialGuid);

        const newGuid = await page.$eval('#captcha_guid', el => el.value);
        console.log(newGuid)
        //////
        const newSrc = await page.$eval('#captcha_image', img => img.src);
        const result = {
            body: JSON.stringify({
                base64Image: newSrc,
                guid: newGuid
            })
        };

        const body = await getWorkerQueue(result); // step 2: send to /api/queue
        const taskResult = await pollStatus(body.task_id); // step 3: poll status
        console.log('Final task result:', taskResult);


        // ////////////////////////////////////////////////
        // // const
        const captchaData = {
            x: '80',
            y: '156',
            guid: '9568076d-ba1a-4a4c-80a1-2220f8886a9b'
        };
        // Access captcha data
        if (taskResult.captcha) {
            const { x, y, captcha_text } = taskResult.captcha;
            captchaData.x = x;
            captchaData.y = y;
            captchaData.guid = body.guid; // from earlier
            captchaData.captcha_text = captcha_text; // from earlier
            console.log(`Captcha position: x=${x}, y=${y} ${captchaData.captcha_text}`);

            // Use the captcha data
            // e.g., click at coordinates, etc.
        }



        // Set values of existing hidden inputs
        await page.evaluate((data) => {
            const xInput = document.querySelector('#captcha_x');
            const yInput = document.querySelector('#captcha_y');
            const guidInput = document.querySelector('#captcha_guid');
            const captcha_text = document.querySelector('.captcha_text');

            if (xInput) xInput.value = data.x;
            if (yInput) yInput.value = data.y;
            if (guidInput) guidInput.value = data.guid;
            if (captcha_text) captcha_text.value = data.captcha_text;
        }, captchaData);
        await page.focus(".captcha_text")
        await page.type('textarea#body', captchaData.captcha_text);

        console.log('Captcha values set successfully.');
        ////////////////////////////////////////////////

        // await page.evaluate(() => {
        //     function makeid(length) {
        //         var result = '';
        //         var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        //         var charactersLength = characters.length;
        //         for (var i = 0; i < length; i++) {
        //             result += characters.charAt(Math.floor(Math.random() * charactersLength));
        //         }
        //         return result;
        //     }
        //     const textarea = document.querySelector('textarea#body');
        //     if (textarea) {
        //         textarea.focus();
        //         const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        //         // nativeInputValueSetter.call(textarea, makeid(20));
        //         nativeInputValueSetter.call(textarea, "Shalom alikhem");
        //         textarea.dispatchEvent(new Event('input', { bubbles: true }));
        //     }
        // });
        await page.focus("textarea#body")
        await page.type('textarea#body', makeid(10));
        // await page.type('textarea#body', 'Dblacked dildo Free palestine! Iceland , Total BBC death');

        ////////////////////////////////////////////////
        await page.waitForSelector('.dropzone');

        const filesToUpload = [
            // { path: './example.png', name: makeid(19) + '.png', type: 'image/png' },
            // { path: './IMG_4590.png', name: makeid(8) + '.png', type: 'image/png' },
            { path: './1755386714937d.png', name: makeid(10) + '.png', type: 'image/png' }
        ];

        const fileDataArray = await Promise.all(
            filesToUpload.map(async (file) => {
                const buffer = await fs.readFile(path.resolve(__dirname, file.path));
                return {
                    name: file.name,
                    type: file.type,
                    base64: buffer.toString('base64')
                };
            })
        );

        await page.evaluate((fileData) => {
            const dropzone = document.querySelector('.dropzone');
            const dataTransfer = new DataTransfer();

            fileData.forEach(({ name, base64, type }) => {
                const byteString = atob(base64);
                const arrayBuffer = new ArrayBuffer(byteString.length);
                const uint8Array = new Uint8Array(arrayBuffer);

                for (let i = 0; i < byteString.length; i++) {
                    uint8Array[i] = byteString.charCodeAt(i);
                }

                const blob = new Blob([arrayBuffer], { type: type });
                const file = new File([blob], name, { type: type });
                dataTransfer.items.add(file);
            });

            const dragEnterEvent = new DragEvent('dragenter', {
                bubbles: true,
                cancelable: true,
                dataTransfer: dataTransfer
            });
            dropzone.dispatchEvent(dragEnterEvent);

            const dropEvent = new DragEvent('drop', {
                bubbles: true,
                cancelable: true,
                dataTransfer: dataTransfer
            });
            dropzone.dispatchEvent(dropEvent);

        }, fileDataArray);

        await page.waitForSelector('.tmb-container', { timeout: 5000 });
        console.log('Files uploaded successfully!');

        const fileCount = await page.evaluate(() => {
            return document.querySelectorAll('.tmb-container').length;
        });
        console.log(`Number of files added: ${fileCount}`);

        await page.evaluate(() => {
            const nsfwCheckbox = document.querySelector('.file-nsfw');
            if (nsfwCheckbox) {
                nsfwCheckbox.checked = false;
            }
        });

        await page.evaluate(() => {
            const spoilerCheckboxes = document.querySelectorAll('.file-spoiler');
            if (spoilerCheckboxes[1]) {
                spoilerCheckboxes[1].checked = false;
            }
        });

        await page.click('input[name="post"][type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle0' })

        // await sleep(4);

        // await sleep(900222220);

    } catch (e) {
        console.log('Error occurred:', e);
    } finally {
        // Only close browser if it was successfully created
        if (browser) {
            try {
                await browser.close();
                console.log('Browser closed successfully');
            } catch (closeError) {
                console.log('Error closing browser:', closeError);
            }
        }
    }
}

async function t() {
    while (true) {
        try {
            await test();
        } catch (e) { console.log(e) }
    }
}
t();
