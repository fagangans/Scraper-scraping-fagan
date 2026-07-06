import got from "got";
import * as cheerio from "cheerio";
import { ScraperError } from "../utils";
import type { GoogleMapsResult, GoogleMapsOptions, GoogleMapsExportOptions } from "./types";
import * as fs from "fs";

const defaultHeaders = {
    "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    // Lewati halaman consent/persetujuan cookie Google yang muncul untuk
    // sesi baru tanpa cookie (penyebab umum "tidak ada hasil").
    cookie: "CONSENT=YES+cb.20240101-00-p0.id+FX+000; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg",
};

// Set DEBUG_GMAPS=1 untuk menyimpan HTML mentah dari Google ke file,
// supaya bisa diperiksa kalau hasil kosong (selector tidak cocok / consent / captcha).
function debugDumpHtml(html: string, tag: string): void {
    if (process.env.DEBUG_GMAPS !== "1") return;
    try {
        const file = `google-debug-${tag}-${Date.now()}.html`;
        fs.writeFileSync(file, html, "utf-8");
        // eslint-disable-next-line no-console
        console.log(`  [debug] HTML mentah disimpan ke ${file} (${html.length} bytes)`);
    } catch {
        /* abaikan kegagalan tulis */
    }
}

function extractPhone(text: string): string {
    const patterns = [
        /(?:\+62|062|62|0)[\s-]?(?:\d{2,4})[\s-]?(?:\d{3,4})[\s-]?(?:\d{3,5})/,
        /\(?\d{3,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,5}/,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[0].trim();
    }
    return "";
}

function parseRating(text: string): number {
    const cleaned = text.replace(",", ".").trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

function parseReviewCount(text: string): number {
    const match = text.match(/\(?([\d.,]+)\)?/);
    if (!match) return 0;
    return parseInt(match[1].replace(/[.,]/g, "")) || 0;
}

function safeDecode(value: string): string {
    if (!value) return "";
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function detectBlockReason(html: string): string | null {
    const lower = html.toLowerCase();
    if (
        lower.includes("consent.google.com") ||
        lower.includes("before you continue") ||
        lower.includes("sebelum melanjutkan ke google")
    ) {
        return "Google menampilkan halaman persetujuan cookie (consent), bukan hasil pencarian.";
    }
    if (
        lower.includes("/sorry/") ||
        lower.includes("unusual traffic") ||
        lower.includes("captcha") ||
        lower.includes("lalu lintas tidak biasa")
    ) {
        return "Google mendeteksi lalu lintas tidak biasa dan meminta verifikasi (captcha). Tunggu beberapa menit lalu coba lagi.";
    }
    if (lower.includes("/httpservice/retry/enablejs")) {
        return "Google meminta verifikasi JavaScript (enablejs challenge) yang tidak bisa dilewati request HTTP biasa. Gunakan mode headless browser.";
    }
    return null;
}

function parsePrimary($: cheerio.CheerioAPI, location: string, limit: number): GoogleMapsResult[] {
    const results: GoogleMapsResult[] = [];

    $("div.VkpGBb").each(function () {
        if (results.length >= limit) return false;
        const el = $(this);

        const name =
            el.find("div.dbg0pd").text().trim() ||
            el.find("span.OSrXXb").text().trim() ||
            el.find("div[role='heading']").text().trim();
        if (!name) return;

        const ratingEl = el.find("span.yi40Hd").text() || el.find("span.BTtC6e").text();
        const rating = parseRating(ratingEl);

        const reviewsEl = el.find("span.RDApEe").text() || el.find("span.UY7F9").text();
        const reviews = parseReviewCount(reviewsEl);

        const detailDivs = el.find("div.rllt__details > div");
        const category =
            el.find("span.YhemCb").text().trim() ||
            detailDivs.eq(0).find("span").first().text().trim();

        let address = "";
        let phone = "";

        detailDivs.each(function () {
            const text = $(this).text().trim();
            if (!address && text.length > 10 && /\d/.test(text) && !/^\d[.,]\d/.test(text)) {
                address = text;
            }
            if (!phone) {
                const p = extractPhone(text);
                if (p) phone = p;
            }
        });

        if (!address) {
            const addrEl = el.find("span.LrzXr");
            if (addrEl.length) address = addrEl.text().trim();
        }

        const fullText = el.text();
        if (!phone) phone = extractPhone(fullText);

        const website =
            el.find('a[data-dtype="d3web"]').attr("href") ||
            el.find("a.yYlJEf").attr("href") ||
            "";

        const mapsLink =
            el.find("a.vwVdIc").attr("href") ||
            el.find('a[href*="maps/place"]').attr("href") ||
            "";

        results.push({
            name,
            rating,
            reviews,
            category,
            address,
            phone,
            website: safeDecode(website),
            mapsUrl: mapsLink ? `https://www.google.com${mapsLink}` : "",
            location,
        });
    });

    return results;
}

function parseFallback($: cheerio.CheerioAPI, location: string, limit: number): GoogleMapsResult[] {
    const results: GoogleMapsResult[] = [];

    $("div[data-cid]").each(function () {
        if (results.length >= limit) return false;
        const el = $(this);

        const name =
            el.find("div[role='heading'] span").text().trim() ||
            el.find("div.dbg0pd").text().trim() ||
            el.find("span.OSrXXb").text().trim();
        if (!name) return;

        const ratingEl =
            el.find("span.yi40Hd").text() ||
            el.find("span.BTtC6e").text() ||
            el.find("span[aria-hidden='true']").first().text();
        const rating = parseRating(ratingEl);

        const reviewsEl = el.find("span.RDApEe").text() || el.find("span.UY7F9").text();
        const reviews = parseReviewCount(reviewsEl);

        const allText = el.text();
        const phone = extractPhone(allText);

        let address = "";
        let category = "";

        el.find("span").each(function () {
            const text = $(this).text().trim();
            if (!category && text.length < 30 && !/\d/.test(text) && text.length > 2) {
                category = text;
            }
            if (!address && text.length > 15 && /[Jj]l\.?|[Kk]el\.?|[Kk]ec\.?|No\.?|\d{5}/.test(text)) {
                address = text;
            }
        });

        const website = el.find('a[href*="http"]:not([href*="google"])').attr("href") || "";

        results.push({
            name,
            rating,
            reviews,
            category,
            address,
            phone,
            website,
            mapsUrl: "",
            location,
        });
    });

    return results;
}

export async function googleMaps(
    keyword: string,
    location: string,
    options: GoogleMapsOptions = {}
): Promise<GoogleMapsResult[]> {
    const { limit = 20, language = "id" } = options;
    const query = `${keyword} di ${location}`;
    const url = `https://www.google.com/search`;
    const html = await got(url, {
        searchParams: {
            q: query,
            tbm: "lcl",
            hl: language,
            gl: "id",
        },
        headers: defaultHeaders,
    }).text();

    debugDumpHtml(html, "v1");

    const $ = cheerio.load(html);
    const results = parsePrimary($, location, limit);

    if (results.length === 0) {
        return googleMapsv2(keyword, location, options);
    }

    return results;
}

export async function googleMapsv2(
    keyword: string,
    location: string,
    options: GoogleMapsOptions = {}
): Promise<GoogleMapsResult[]> {
    const { limit = 20, language = "id" } = options;
    const query = `${keyword} di ${location}`;
    const url = `https://www.google.com/search`;
    const html = await got(url, {
        searchParams: {
            q: query,
            tbm: "lcl",
            hl: language,
            gl: "id",
            sa: "X",
        },
        headers: {
            ...defaultHeaders,
            "user-agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
    }).text();

    debugDumpHtml(html, "v2");

    const $ = cheerio.load(html);
    const results = parseFallback($, location, limit);

    if (results.length === 0) {
        const reason = detectBlockReason(html);
        if (reason) {
            throw new ScraperError(`${reason} Jalankan dengan DEBUG_GMAPS=1 untuk menyimpan HTML mentah.`);
        }
        throw new ScraperError(
            `Tidak ditemukan hasil untuk "${keyword}" di "${location}". ` +
                "Struktur halaman Google mungkin berubah. Jalankan dengan DEBUG_GMAPS=1 " +
                "untuk menyimpan HTML mentah dan kirim ke developer untuk update selector."
        );
    }

    return results;
}

/**
 * Versi headless browser (Puppeteer). Membuka Chrome tanpa tampilan, benar-benar
 * menjalankan JavaScript Google sehingga lolos dari challenge "enablejs" yang
 * memblokir request HTTP biasa (got/fetch). Hanya untuk pemakaian lokal —
 * tidak cocok dijalankan di Vercel serverless (ukuran Chromium terlalu besar).
 */
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
    return delay(minMs + Math.random() * (maxMs - minMs));
}

// Kelas CSS di bawah ini adalah selector feed hasil Google Maps
// (maps.google.com/maps/search) yang umum dipakai komunitas scraping.
// Sama seperti selector lain di file ini, Google bisa mengubahnya
// kapan saja tanpa pemberitahuan — kalau parser ini berhenti bekerja,
// jalankan dengan DEBUG_GMAPS=1 dan kirim HTML "maps-feed" untuk
// diperiksa ulang selectornya.
function parseMapsFeed($: cheerio.CheerioAPI, location: string, limit: number): GoogleMapsResult[] {
    const results: GoogleMapsResult[] = [];

    $("div[role='feed'] > div").each(function () {
        if (results.length >= limit) return false;
        const el = $(this);

        const name =
            el.find("div.qBF1Pd").first().text().trim() ||
            el.find("a[aria-label]").first().attr("aria-label") ||
            "";
        if (!name) return;

        const rating = parseRating(el.find("span.MW4etd").first().text().trim());
        const reviews = parseReviewCount(el.find("span.UY7F9").first().text().trim());

        const detailTexts = el
            .find("div.W4Efsd span")
            .map((_, s) => $(s).text().trim())
            .get()
            .filter(Boolean);

        const category = detailTexts.find((t) => t.length < 30 && !/\d/.test(t)) || "";
        const address = detailTexts.find((t) => t.length > 10 && /\d/.test(t)) || "";
        const phone = extractPhone(el.text());
        const mapsLink = el.find("a[href*='/maps/place']").first().attr("href") || "";

        results.push({
            name,
            rating,
            reviews,
            category,
            address,
            phone,
            website: "",
            mapsUrl: mapsLink || "",
            location,
        });
    });

    return results;
}

async function scrollMapsFeed(page: any, rounds: number): Promise<void> {
    for (let i = 0; i < rounds; i++) {
        await page
            .evaluate(() => {
                const feed = document.querySelector("div[role='feed']");
                if (feed) feed.scrollTop = feed.scrollHeight;
            })
            .catch(() => {});
        await randomDelay(700, 1200);
    }
}

export async function googleMapsHeadless(
    keyword: string,
    location: string,
    options: GoogleMapsOptions = {}
): Promise<GoogleMapsResult[]> {
    const { limit = 20, language = "id" } = options;

    let puppeteer: any;
    try {
        // puppeteer-extra + stealth plugin menyamarkan jejak automation
        // (navigator.webdriver, dll) supaya lebih kecil kemungkinan Google
        // memaksa halaman consent/captcha. Fallback ke puppeteer biasa
        // kalau paket tambahan ini belum terinstal.
        puppeteer = require("puppeteer-extra");
        const StealthPlugin = require("puppeteer-extra-plugin-stealth");
        puppeteer.use(StealthPlugin());
    } catch {
        try {
            puppeteer = require("puppeteer");
        } catch {
            throw new ScraperError(
                "Paket 'puppeteer' belum terinstal. Jalankan: npm install puppeteer"
            );
        }
    }

    const query = `${keyword} di ${location}`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=lcl&hl=${language}&gl=id`;

    // Mode headless klasik (headless:true) punya beberapa fingerprint yang
    // berbeda dari Chrome biasa walau sudah pakai stealth plugin. Kalau
    // paket 'xvfb' (virtual display) tersedia, jalankan Chrome dalam mode
    // headless:false di dalam display virtual — jauh lebih sulit dibedakan
    // dari Chrome yang dipakai manusia. Kalau tidak ada, tetap pakai
    // headless:true seperti biasa (tidak fatal, cuma kurang optimal).
    let xvfb: any = null;
    let useHeadless = true;
    try {
        const Xvfb = require("xvfb");
        xvfb = new Xvfb({ silent: true, xvfb_args: ["-screen", "0", "1280x800x24", "-ac"] });
        await new Promise<void>((resolve, reject) => {
            xvfb.start((err: any) => (err ? reject(err) : resolve()));
        });
        useHeadless = false;
    } catch {
        xvfb = null;
        useHeadless = true;
    }

    let browser: any;
    try {
        browser = await puppeteer.launch({
            headless: useHeadless,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-blink-features=AutomationControlled",
            ],
            timeout: 30000,
        });
    } catch (launchErr: any) {
        if (xvfb) {
            await new Promise<void>((resolve) => xvfb.stop(() => resolve())).catch(() => {});
        }
        const msg = String((launchErr && launchErr.message) || launchErr);
        if (/libnss3|libatk|libgbm|error while loading shared libraries|shared object file|Failed to launch/i.test(msg)) {
            throw new ScraperError(
                "Chrome gagal dijalankan karena library sistem belum lengkap di server ini. " +
                    "Di Ubuntu/Debian jalankan: sudo apt-get update && sudo apt-get install -y " +
                    "libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 " +
                    "libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libpangocairo-1.0-0 " +
                    "libcairo2 fonts-liberation. Detail: " + msg
            );
        }
        throw new ScraperError(`Gagal membuka headless Chrome: ${msg}`);
    }

    try {
        const page = await browser.newPage();
        await page.setUserAgent(defaultHeaders["user-agent"]);
        await page.setExtraHTTPHeaders({ "accept-language": defaultHeaders["accept-language"] });
        await page.setCookie(
            { name: "CONSENT", value: "YES+cb.20240101-00-p0.id+FX+000", domain: ".google.com" },
            { name: "SOCS", value: "CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg", domain: ".google.com" }
        );

        // "Pemanasan" sesi: buka beranda Google dan ketik query seperti
        // manusia (bukan langsung tembak URL pencarian), supaya sesi
        // browser punya histori navigasi wajar sebelum menyentuh endpoint
        // pencarian lokal. Kegagalan langkah ini tidak fatal — kalau ada
        // apa pun yang meleset, tetap lanjut ke pencarian langsung.
        try {
            await page.goto("https://www.google.com/", { waitUntil: "networkidle2", timeout: 20000 });
            await randomDelay(500, 1200);
            const searchBox = await page.$("input[name='q'], textarea[name='q']");
            if (searchBox) {
                await searchBox.click();
                await page.type("input[name='q'], textarea[name='q']", query, { delay: 60 });
                await randomDelay(300, 800);
            }
        } catch {
            /* abaikan, lanjut ke pencarian langsung */
        }

        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
        // Halaman challenge "enablejs" mengalihkan otomatis setelah JS jalan;
        // beri waktu tambahan dan tunggu jika masih ada redirect lanjutan.
        await page.waitForNetworkIdle({ idleTime: 800, timeout: 15000 }).catch(() => {});

        // Cookie CONSENT saja kadang tidak cukup (mis. dari IP data center),
        // Google tetap menampilkan halaman persetujuan interaktif. Coba klik
        // tombol accept secara otomatis kalau muncul, baik di halaman utama
        // maupun di dalam iframe (beberapa varian consent Google memakainya).
        async function clickConsentButton(frame: any): Promise<boolean> {
            return frame
                .evaluate(() => {
                    // #L2AGLb adalah id tombol "I agree" yang sudah lama stabil
                    // dipakai Google di halaman consent.google.com.
                    const byId = document.querySelector<HTMLElement>("#L2AGLb");
                    if (byId) {
                        byId.click();
                        return true;
                    }
                    const texts = ["accept all", "i agree", "terima semua", "setuju", "saya setuju"];
                    const candidates = Array.from(
                        document.querySelectorAll<HTMLElement>(
                            "button, div[role='button'], span[role='button']"
                        )
                    );
                    for (const el of candidates) {
                        const t = (el.innerText || el.textContent || "").trim().toLowerCase();
                        if (texts.some((needle) => t === needle || t.includes(needle))) {
                            el.click();
                            return true;
                        }
                    }
                    return false;
                })
                .catch(() => false);
        }

        if (/consent\.google\.com/i.test(page.url())) {
            let clicked = await clickConsentButton(page.mainFrame());
            if (!clicked) {
                for (const frame of page.frames()) {
                    if (await clickConsentButton(frame)) {
                        clicked = true;
                        break;
                    }
                }
            }
            if (clicked) {
                await page
                    .waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 })
                    .catch(() => {});
                await page.waitForNetworkIdle({ idleTime: 800, timeout: 15000 }).catch(() => {});
            } else {
                debugDumpHtml(await page.content(), "consent-not-clicked");
            }
        }

        const html = await page.content();
        debugDumpHtml(html, "headless");

        const $ = cheerio.load(html);
        let results = parsePrimary($, location, limit);
        if (results.length === 0) {
            results = parseFallback($, location, limit);
        }

        // Kalau endpoint pencarian lokal tetap kosong, coba tingkat ketiga:
        // buka antarmuka Google Maps langsung (bukan google.com/search).
        // Ini kadang punya jalur deteksi bot berbeda dari halaman pencarian.
        if (results.length === 0) {
            try {
                const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=${language}`;
                await page.goto(mapsUrl, { waitUntil: "networkidle2", timeout: 30000 });
                await page.waitForSelector("div[role='feed']", { timeout: 12000 }).catch(() => {});
                await scrollMapsFeed(page, 4);

                const mapsHtml = await page.content();
                debugDumpHtml(mapsHtml, "maps-feed");

                const $maps = cheerio.load(mapsHtml);
                results = parseMapsFeed($maps, location, limit);
            } catch {
                /* abaikan, tetap lanjut ke penanganan hasil kosong di bawah */
            }
        }

        if (results.length === 0) {
            const reason = detectBlockReason(html);
            throw new ScraperError(
                reason ||
                    `Tidak ditemukan hasil untuk "${keyword}" di "${location}". Coba kata kunci lain.`
            );
        }

        return results;
    } finally {
        await browser.close();
        if (xvfb) {
            await new Promise<void>((resolve) => xvfb.stop(() => resolve())).catch(() => {});
        }
    }
}

/**
 * Fallback gratis 100% memakai OpenStreetMap (Nominatim API) ketika kedua
 * mode Google (headless & HTTP) gagal karena diblokir. Tidak pernah kena
 * captcha/consent karena ini API resmi, bukan scraping. Keterbatasan:
 * tidak ada data rating/jumlah review (OSM tidak punya konsep itu), dan
 * kelengkapan alamat/telepon/website tergantung kontribusi data OSM di
 * lokasi tersebut (biasanya lebih tipis dibanding Google Maps).
 */
export async function googleMapsOsmFallback(
    keyword: string,
    location: string,
    options: GoogleMapsOptions = {}
): Promise<GoogleMapsResult[]> {
    const { limit = 20 } = options;
    const query = `${keyword} ${location}`;

    const rows = await got("https://nominatim.openstreetmap.org/search", {
        searchParams: {
            q: query,
            format: "json",
            addressdetails: 1,
            extratags: 1,
            limit: String(Math.min(limit, 50)),
        },
        headers: {
            "user-agent": "MapsBiz-Scraper/1.0 (personal use; contact: -)",
            "accept-language": "id-ID,id;q=0.9",
        },
    }).json<any[]>();

    if (!rows || rows.length === 0) {
        throw new ScraperError(
            `Tidak ditemukan hasil di OpenStreetMap untuk "${keyword}" di "${location}". Coba kata kunci lain.`
        );
    }

    return rows.map((item) => {
        const extratags = item.extratags || {};
        const name = (item.namedetails && item.namedetails.name) || item.display_name.split(",")[0];
        return {
            name,
            rating: 0,
            reviews: 0,
            category: item.type || item.class || "",
            address: item.display_name || "",
            phone: extratags.phone || extratags["contact:phone"] || "",
            website: extratags.website || extratags["contact:website"] || "",
            mapsUrl: `https://www.openstreetmap.org/${item.osm_type}/${item.osm_id}`,
            location,
        };
    });
}

export function googleMapsExport(
    results: GoogleMapsResult[],
    options: GoogleMapsExportOptions = {}
): string {
    const { filepath, format = "json", pretty = true } = options;

    let output: string;

    if (format === "csv") {
        const headers = [
            "No",
            "Nama",
            "Kategori",
            "Rating",
            "Jumlah Review",
            "Alamat",
            "Telepon",
            "Website",
            "Google Maps",
            "Lokasi",
        ];
        const rows = results.map((r, i) =>
            [
                i + 1,
                `"${r.name.replace(/"/g, '""')}"`,
                `"${r.category.replace(/"/g, '""')}"`,
                r.rating,
                r.reviews,
                `"${r.address.replace(/"/g, '""')}"`,
                `"${r.phone}"`,
                `"${r.website}"`,
                `"${r.mapsUrl}"`,
                `"${r.location}"`,
            ].join(",")
        );
        output = [headers.join(","), ...rows].join("\n");
    } else {
        const data = {
            totalResults: results.length,
            scrapedAt: new Date().toISOString(),
            results: results.map((r, i) => ({ no: i + 1, ...r })),
        };
        output = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    }

    if (filepath) {
        fs.writeFileSync(filepath, output, "utf-8");
    }

    return output;
}

export function googleMapsFilter(
    results: GoogleMapsResult[],
    options: {
        minRating?: number;
        maxRating?: number;
        minReviews?: number;
        hasPhone?: boolean;
        hasWebsite?: boolean;
        keyword?: string;
    } = {}
): GoogleMapsResult[] {
    return results.filter((r) => {
        if (options.minRating !== undefined && r.rating < options.minRating) return false;
        if (options.maxRating !== undefined && r.rating > options.maxRating) return false;
        if (options.minReviews !== undefined && r.reviews < options.minReviews) return false;
        if (options.hasPhone && !r.phone) return false;
        if (options.hasWebsite && !r.website) return false;
        if (options.keyword) {
            const kw = options.keyword.toLowerCase();
            const searchable = `${r.name} ${r.category} ${r.address}`.toLowerCase();
            if (!searchable.includes(kw)) return false;
        }
        return true;
    });
}

export function googleMapsSummary(results: GoogleMapsResult[]): {
    total: number;
    avgRating: number;
    totalReviews: number;
    withPhone: number;
    withWebsite: number;
    categories: { [key: string]: number };
    topRated: GoogleMapsResult[];
} {
    const total = results.length;
    const avgRating =
        total > 0
            ? Math.round((results.reduce((sum, r) => sum + r.rating, 0) / total) * 100) / 100
            : 0;
    const totalReviews = results.reduce((sum, r) => sum + r.reviews, 0);
    const withPhone = results.filter((r) => r.phone).length;
    const withWebsite = results.filter((r) => r.website).length;

    const categories: { [key: string]: number } = {};
    results.forEach((r) => {
        if (r.category) {
            categories[r.category] = (categories[r.category] || 0) + 1;
        }
    });

    const topRated = [...results].sort((a, b) => b.rating - a.rating || b.reviews - a.reviews).slice(0, 5);

    return { total, avgRating, totalReviews, withPhone, withWebsite, categories, topRated };
}
