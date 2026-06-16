import got from "got";
import cheerio from "cheerio";
import { ScraperError } from "../utils";
import type { GoogleMapsResult, GoogleMapsOptions, GoogleMapsExportOptions } from "./types";
import * as fs from "fs";

const defaultHeaders = {
    "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
};

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

    const $ = cheerio.load(html);
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
            website: website ? decodeURIComponent(website) : "",
            mapsUrl: mapsLink ? `https://www.google.com${mapsLink}` : "",
            location,
        });
    });

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

    const $ = cheerio.load(html);
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

    if (results.length === 0) {
        throw new ScraperError(
            `Tidak ditemukan hasil untuk "${keyword}" di "${location}". Coba kata kunci lain.`
        );
    }

    return results;
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
