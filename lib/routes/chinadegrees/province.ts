import { Route } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
const __dirname = getCurrentPath(import.meta.url);

import cache from '@/utils/cache';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import { art } from '@/utils/render';
import * as path from 'node:path';
import { config } from '@/config';
import puppeteer from '@/utils/puppeteer';
const baseUrl = 'http://www.chinadegrees.com.cn';

export const route: Route = {
    path: '/:province?',
    categories: ['study'],
    example: '/chinadegrees/11',
    parameters: { province: '省市代号，见下表，亦可在 [这里](http://www.chinadegrees.com.cn/help/provinceSwqk.html) 找到，默认为 `11`' },
    features: {
        requireConfig: false,
        requirePuppeteer: true,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'Unknown',
    maintainers: ['TonyRL'],
    handler,
};

async function handler(ctx) {
    const { province = '11' } = ctx.req.param();
    const url = `${baseUrl}/help/unitSwqk${province}.html`;

    const data = await cache.tryGet(
        url,
        async () => {
            const browser = await puppeteer();
            const page = await browser.newPage();
            await page.setRequestInterception(true);
            page.on('request', (request) => {
                request.resourceType() === 'document' || request.resourceType() === 'script' ? request.continue() : request.abort();
            });
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
            });
            await page.waitForSelector('.datalist');

            const html = await page.evaluate(() => document.documentElement.innerHTML);
            await browser.close();

            const $ = load(html);
            return {
                title: $('caption').text().trim(),
                items: $('.datalist tr')
                    .toArray()
                    .slice(1)
                    .map((item) => {
                        item = $(item);
                        const title = item.find('td').eq(1).text();
                        const pubDate = item.find('td').eq(2).text();
                        return {
                            title,
                            pubDate,
                            guid: `${title}:${pubDate}`,
                        };
                    })
                    .filter((item) => item.title !== 'null'),
            };
        },
        config.cache.routeExpire,
        false
    );

    const items = data.items.map((item) => {
        item.description = art(path.join(__dirname, 'templates/description.art'), {
            title: item.title,
            pubDate: item.pubDate,
        });
        item.pubDate = parseDate(item.pubDate, 'YYYY-MM-DD');
        return item;
    });

    return {
        title: data.title,
        link: url,
        item: items,
    };
}
