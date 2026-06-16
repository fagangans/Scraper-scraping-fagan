import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { URL } from "url";
import {
    googleMaps,
    googleMapsFilter,
    googleMapsSummary,
} from "../src/others/google-maps";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME: { [ext: string]: string } = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const urlPath = (req.url || "/").split("?")[0];
    const filePath = path.join(
        PUBLIC_DIR,
        urlPath === "/" ? "index.html" : urlPath
    );
    if (!filePath.startsWith(PUBLIC_DIR)) return false;
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
    return true;
}

function sendJson(res: http.ServerResponse, status: number, data: any) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname === "/api/search" && req.method === "GET") {
        const keyword = url.searchParams.get("keyword")?.trim();
        const location = url.searchParams.get("location")?.trim();
        const limit = parseInt(url.searchParams.get("limit") || "20");
        const minRating = parseFloat(url.searchParams.get("minRating") || "0");
        const hasPhone = url.searchParams.get("hasPhone") === "true";

        if (!keyword || !location) {
            return sendJson(res, 400, {
                error: "Parameter 'keyword' dan 'location' wajib diisi.",
            });
        }

        try {
            let results = await googleMaps(keyword, location, { limit });
            if (minRating > 0 || hasPhone) {
                results = googleMapsFilter(results, { minRating, hasPhone });
            }
            const summary = googleMapsSummary(results);
            return sendJson(res, 200, { results, summary });
        } catch (err: any) {
            return sendJson(res, 500, { error: err.message || "Terjadi kesalahan." });
        }
    }

    if (serveStatic(req, res)) return;

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
});

server.listen(PORT, () => {
    console.log(`\n  MapsBiz Scraper running at http://localhost:${PORT}\n`);
});
