import cheerio from "cheerio";
import got from "got";
import { TwitterDownloader, TwitterDownloaderv2 } from "./types";

export async function twitterdl(
	url: string
): Promise<TwitterDownloader[] | []> {
	if (!/https:\/\/twitter\.com\//i.test(url)) throw "URL invalid!";
	const payload: { url: string } = { url };
	const res = await got(
		"https://www.expertsphp.com/instagram-reels-downloader.php",
		{
			method: "POST",
			searchParams: new URLSearchParams(Object.entries(payload)),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				cookie: process.env.TWITTER_COOKIE || "",
				origin: "https://www.expertsphp.com",
				referer: "https://www.expertsphp.com/twitter-video-downloader.html",
				"user-agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
			},
		}
	).text();
	const $ = cheerio.load(res);
	let results: TwitterDownloader[] = [];
	$("table.table > tbody > tr").each(function () {
		const quality = $(this).find("td").eq(2).find("strong").text();
		const type = $(this).find("td").eq(1).find("strong").text();
		const url = $(this).find("td").eq(0).find("a[href]").attr("href");
		const isVideo = /video/i.test(type);
		results.push({
			quality,
			type,
			url,
			isVideo,
		});
	});
	return results;
}

export async function twitterdlv2(url: string): Promise<TwitterDownloaderv2[]> {
	const resToken = await got("https://twittervideodownloader.com/", {
		headers: {
			accept:
				"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
			"accept-encoding": "gzip, deflate, br",
			cookie: process.env.TWITTER_COOKIE || "",
			"user-agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
		},
	}).text();
	const $ = cheerio.load(resToken);
	const payload: { csrfmiddlewaretoken: string; tweet: string } = {
		csrfmiddlewaretoken: $('input[name="csrfmiddlewaretoken"]').val() as string,
		tweet: url,
	};
	const res = await got
		.post("https://twittervideodownloader.com/download", {
			form: payload,
			headers: {
				accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
				"accept-encoding": "gzip, deflate, br",
				"content-type": "application/x-www-form-urlencoded",
				cookie: process.env.TWITTER_COOKIE || "",
				origin: "https://twittervideodownloader.com",
				referer: "https://twittervideodownloader.com/",
				"user-agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
			},
		})
		.text();
	let results: TwitterDownloaderv2[] = [];
	const $$ = cheerio.load(res);
	$$("div.row.body-container > div > center > div.row").each(function () {
		const el = $(this).find("div");
		const _quality = el.eq(1).find("p").text().split(":");
		const quality = _quality?.[0]?.trim();
		const type = _quality?.[1]?.trim();
		const url = el.eq(0).find("a[download]").attr("href");
		results.push({ quality, type, url } as TwitterDownloaderv2);
	});
	return results;
}
