import { expect } from 'chai'
import {
    wikipedia,
    jadwalTV,
    jadwalTVNow,
    listJadwalTV,
    mediafiredl,
    gempa,
    gempaNow,
    tsunami,
    lyrics,
    lyricsv2,
    kbbi,
    statusJava,
    googleMaps,
    googleMapsExport,
    googleMapsFilter,
    googleMapsSummary,
} from './index'

describe('Others', () => {

    // TODO
    describe('Minecraft', () => {
        // it('Minecraft java', done => {
        //     statusJava('moelsmp2.mcalias.com', 25566).then(res => {
        //         expect(res).to.be.an('object')
        //         expect(res.ip).to.be.a('string')
        //         expect(res.port).to.be.a('number')
        //         expect(res.description).to.be.a('string')
        //         expect(res.descriptionText).to.be.a('string')
        //         expect(res.players).to.be.an('object')
        //         expect(res.players.max).to.be.a('number')
        //         expect(res.players.online).to.be.a('number')
        //         expect(res.players.sample).to.be.an('array')
        //         expect(res.version).to.be.an('object')
        //         expect(res.version.name).to.be.a('string')
        //         expect(res.version.protocol).to.be.a('number')
        //         expect(res.favicon).to.be.a('string')

        //         return done()
        //     }).catch(done)
        // })
    })

    it('Wikipedia', (done) => {
        wikipedia('Minecraft', 'en').then(res => {
            expect(res).to.be.an('object')
            expect(res.title).to.be.a('string')
            expect(res.img).to.be.a('string')
            expect(res.articles).to.be.a('string')

            return done()
        }).catch(done)
    })
    describe('Jadwal TV', () => {
        it('Jadwal TV', done => {
            jadwalTV('RCTI').then(res => {
                expect(res).to.be.an('object')
                expect(res.channel).to.be.a('string')
                expect(res.result).to.be.an('array')
                expect(res.result).to.have.lengthOf.at.least(1)

                return done()
            }).catch(done)
        })

        it('Jadwal TV NOW', done => {
            jadwalTVNow().then(res => {
                expect(res).to.be.an('object')
                Object.keys(res).forEach(key => {
                    expect(key).to.be.a('string')
                    expect(res[key]).to.be.an('array')
                    expect(res[key]).to.have.lengthOf.at.least(2)
                })

                return done()
            }).catch(done)
        })
    })

    describe('Mediafire', () => {
        it('Mediafire Download', done => {
            mediafiredl('https://www.mediafire.com/file/gpeiucmm1xo6ln0/hello_world.mp4/file').then(res => {
                expect(res).to.be.an('object')
                expect(res.url).to.be.a('string')
                expect(res.url2).to.be.a('string')
                expect(res.filename).to.be.a('string')
                expect(res.aploud).to.be.a('string')
                expect(res.filesizeH).to.be.a('string')
                expect(res.filesize).to.be.a('number')

                return done()
            }).catch(done)
        })
    })

    describe('Gempa', () => {
        it('Gempa', done => {
            gempa().then(res => {
                expect(res).to.be.an('array')
                res.forEach(({
                    date,
                    locate,
                    magnitude,
                    depth,
                    location,
                    warning
                }) => {
                    expect(date).to.be.a('string')
                    expect(locate).to.be.a('string')
                    expect(magnitude).to.be.a('string')
                    expect(depth).to.be.a('string')
                    expect(location).to.be.a('string')
                    expect(warning).to.be.an('array')
                    warning.forEach(s => expect(s).to.be.a('string'))

                })

                return done()
            }).catch(done)
        })

        it('Gempa Now', done => {
            gempaNow().then(res => {
                expect(res).to.be.an('array')
                res.forEach(({
                    date,
                    latitude,
                    longitude,
                    magnitude,
                    depth,
                    location,
                }) => {
                    expect(date).to.be.a('string')
                    expect(latitude).to.be.a('string')
                    expect(longitude).to.be.a('string')
                    expect(magnitude).to.be.a('string')
                    expect(depth).to.be.a('string')
                    expect(location).to.be.a('string')

                })

                return done()
            }).catch(done)
        })
    })

    it('Tsunami', (done) => {
        tsunami().then(res => {
            expect(res).to.be.an('array')
            res.forEach(({
                date,
                locate,
                magnitude,
                depth,
                location,
            }) => {
                expect(date).to.be.a('string')
                expect(locate).to.be.a('string')
                expect(magnitude).to.be.a('string')
                expect(depth).to.be.a('string')
                expect(location).to.be.a('string')

            })

            return done()
        }).catch(done)
    })

    describe('Lyrics', () => {
        it('Lyrics', done => {
            lyrics('rick astley never gonna give you up').then(res => {
                expect(res).to.be.an('object')
                expect(res.title).to.be.a('string')
                expect(res.author).to.be.a('string')
                expect(res.lyrics).to.be.a('string')
                expect(res.link).to.be.a('string')

                return done()
            }).catch(done)
        })

        // it('Lyrics V2', done => {
        //     lyricsv2('never gonna give you up').then(res => {
        //         expect(res.title).to.be.a('string')
        //         expect(res.author).to.be.a('string')
        //         expect(res.lyrics).to.be.a('string')
        //         expect(res.link).to.be.a('string')

        //         return done()
        //     }).catch(done)
        // })
    })

    describe('Google Maps', () => {
        it('Google Maps Search', done => {
            googleMaps('restoran', 'palembang', { limit: 5 }).then(res => {
                expect(res).to.be.an('array')
                res.forEach(({
                    name,
                    rating,
                    reviews,
                    category,
                    address,
                    phone,
                    website,
                    mapsUrl,
                    location,
                }) => {
                    expect(name).to.be.a('string')
                    expect(name).to.have.lengthOf.at.least(1)
                    expect(rating).to.be.a('number')
                    expect(reviews).to.be.a('number')
                    expect(category).to.be.a('string')
                    expect(address).to.be.a('string')
                    expect(phone).to.be.a('string')
                    expect(website).to.be.a('string')
                    expect(mapsUrl).to.be.a('string')
                    expect(location).to.be.a('string')
                })

                return done()
            }).catch(done)
        })

        it('Google Maps Export JSON', done => {
            googleMaps('hotel', 'jakarta', { limit: 3 }).then(res => {
                const json = googleMapsExport(res, { format: 'json' })
                expect(json).to.be.a('string')
                const parsed = JSON.parse(json)
                expect(parsed.totalResults).to.be.a('number')
                expect(parsed.results).to.be.an('array')

                return done()
            }).catch(done)
        })

        it('Google Maps Export CSV', done => {
            googleMaps('cafe', 'bandung', { limit: 3 }).then(res => {
                const csv = googleMapsExport(res, { format: 'csv' })
                expect(csv).to.be.a('string')
                expect(csv).to.include('Nama')
                expect(csv).to.include('Rating')

                return done()
            }).catch(done)
        })

        it('Google Maps Filter', done => {
            googleMaps('restoran', 'surabaya', { limit: 10 }).then(res => {
                const filtered = googleMapsFilter(res, { minRating: 4.0 })
                expect(filtered).to.be.an('array')
                filtered.forEach(r => {
                    expect(r.rating).to.be.at.least(4.0)
                })

                return done()
            }).catch(done)
        })

        it('Google Maps Summary', done => {
            googleMaps('toko', 'yogyakarta', { limit: 5 }).then(res => {
                const summary = googleMapsSummary(res)
                expect(summary.total).to.be.a('number')
                expect(summary.avgRating).to.be.a('number')
                expect(summary.totalReviews).to.be.a('number')
                expect(summary.withPhone).to.be.a('number')
                expect(summary.withWebsite).to.be.a('number')
                expect(summary.categories).to.be.an('object')
                expect(summary.topRated).to.be.an('array')

                return done()
            }).catch(done)
        })
    })

    it('KBBI', done => {
        kbbi('halo').then(res => {
            expect(res).to.be.an('array')
            res.forEach((
                { index, title, means }
            ) => {
                expect(index).to.be.a('number')
                expect(title).to.be.a('string')
                expect(means).to.be.an('array')
                means.forEach(
                    (mean) => expect(mean).to.be.a('string')
                )
            })

            return done()
        }).catch(done)
    })
})