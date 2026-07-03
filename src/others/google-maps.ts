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
export async function googleMapsHeadless(
    keyword: string,
    location: string,
    options: GoogleMapsOptions = {}
): Promise<GoogleMapsResult[]> {
    const { limit = 20, language = "id" } = options;

    let puppeteer: any;
    try {
        puppeteer = require("puppeteer");
    } catch {
        throw new ScraperError(
            "Paket 'puppeteer' belum terinstal. Jalankan: npm install puppeteer"
        );
    }

    const query = `${keyword} di ${location}`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=lcl&hl=${language}&gl=id`;

    let browser: any;
    try {
        browser = await puppeteer.launch({
            headless: true,
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

        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
        // Halaman challenge "enablejs" mengalihkan otomatis setelah JS jalan;
        // beri waktu tambahan dan tunggu jika masih ada redirect lanjutan.
        await page.waitForNetworkIdle({ idleTime: 800, timeout: 15000 }).catch(() => {});

        const html = await page.content();
        debugDumpHtml(html, "headless");

        const $ = cheerio.load(html);
        let results = parsePrimary($, location, limit);
        if (results.length === 0) {
            results = parseFallback($, location, limit);
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
    }
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
