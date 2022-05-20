import { doScreenshot } from './../core/screenshots';
declare const injectedHelpers : any, document: any;

import {puppeteer, puppeteerUtils, models, captureHelpers, parsers, domUtils } from '../barrel';
import { CapturePerformer } from '../core/models';
import { runInNewContext } from 'vm';

export const outputLog = (log: models.CaptureLog) => {    
    console.log(`Capture Log: tenant: ${log.tenantName}, channelName: ${log.channelName}, date: ${log.logDt}...`);
    console.log(`totalCapturedEvents: ${log.totalCapturedEvents}, error logs: ${log.errorLogs.length}`);
    log.errorLogs.forEach(x => console.log(`\tError: ${x}`));
}

export const removeEventsWithMissingDates = (results: models.CaptureResults, log: models.CaptureLog) => {
    results.events = results.events.filter(val => {
        if (!val.startDt) {
            let eventUri = '';
            if (val && val.eventUris && val.eventUris.length)
                eventUri = val.eventUris[0].uri;
            log.errorLogs.push(`Removing event because no date could be found: ${val.eventTitle}, ${eventUri}`);
            return false;
        }
        return true;
    });
}

export const parseTicketFly = async(page: puppeteer.Page, curEvent:models.CaptureEvent, log: models.CaptureLog, deps: any) : Promise<[models.CaptureLog, models.CaptureEvent]> => {

    console.log(`getting detail page: ${deps.curUri}`);

    try {
        //browse to the cur event's detail page
        await puppeteerUtils.goto(page, deps.curUri, deps.navSettings);

        //add helpers from parsers module into page
        await puppeteerUtils.injectHelpers(page, [parsers, domUtils], 'injectedHelpers');

        const TICKETFLY_CONTENT_SELECTOR : string = "#event-detail div.content";
        
        //scrape from container element
        [log, curEvent] = await page.$$eval<[models.CaptureLog, models.CaptureEvent], models.CaptureEvent, models.CaptureLog, any>(
                TICKETFLY_CONTENT_SELECTOR, 
                parseTicketFlyDetailPageBrowserFn, 
                curEvent,
                log,
                deps);
    } catch (e) {
        log.errorLogs.push(`Error navigating to detail page: ${deps.curUri} : ${e.message} .`);
    } finally {
        return [log, curEvent];
    }
}

let parseTicketFlyDetailPageBrowserFn = (detailCtx, curEvent: models.CaptureEvent, log: models.CaptureLog, deps : any): [models.CaptureLog, models.CaptureEvent] => {    
    try {
        curEvent.detailPageInnerText = document.body.innerText;
        curEvent.detailPageHtml = document.body.innerHTML;

        if (!detailCtx || detailCtx.length < 1) {
            log.errorLogs.push(`Could not find Detail Container Element for page: ${deps.curUri}`);
        }
        else if (detailCtx.length > 0) {
            let curCtx = detailCtx[0];
            
            //get main image
            let imgItem = curCtx.querySelector("#image img");
            if (imgItem)
            {
            let imageUri = imgItem.getAttribute("src").trim();  
            if (curEvent.eventImageUris.indexOf(imageUri) === -1) {
                curEvent.eventImageUris.push(imageUri);
            }    
            } else {
                log.warningLogs.push(`Image not found in #image img in detail page for: ${deps.curUri}`);
            }

            //get additional event info
            let addlInfo = curCtx.querySelector("#additional-ticket-text");
            if (addlInfo) {
                curEvent.eventDesc = addlInfo.innerText;
            } 

            //get handle to event container, which has most of the important info
            let eventContainer = curCtx.querySelector("#event");
            if (eventContainer) {
                if (!curEvent.performers) curEvent.performers = [];

                //get main performer
                let mainAct = eventContainer.querySelector('div.event-name');
                if (mainAct) {
                    let mainActName = mainAct.innerText;
                    //NOTE/TODO: possibly need a logic update
                    //"jodie foster's army" on main page was "jfa" on detail page, so they get added as 2 bands
                    let idx = curEvent.performers.findIndex((x) => x.performerName.toLowerCase() == mainActName.toLowerCase());
                    if (idx ===  -1) {
                        curEvent.performers.push({ performerName: mainActName, isPrimaryPerformer: true} as models.CapturePerformer)
                    } else {
                        curEvent.performers[idx].isPrimaryPerformer = true;
                    }
                } else {
                    log.warningLogs.push(`Main performer not found in div.event-name in detail page for: ${deps.curUri}`);
                }

                //get supporting performers
                let supportingAct = eventContainer.querySelector('div.supports');
                let hasSupportingActs = false;
                if (supportingAct) {                
                    //TODO: Logic improvement needed to handle band names which include commas
                    let supportingActNames = supportingAct.innerText.split(",").map(x => x.trim());
                    for(let name of supportingActNames) {
                        let idx = curEvent.performers.findIndex((x) => x.performerName.toLowerCase() == name.toLowerCase());
                        if (idx ===  -1) {
                            curEvent.performers.push({ performerName: name, isPrimaryPerformer: false} as models.CapturePerformer)
                            hasSupportingActs = true;
                        } else {
                            curEvent.performers[idx].isPrimaryPerformer = false;
                        }
                    }
                } else {
                    log.warningLogs.push(`Supporting performers not found in div.supports in detail page for: ${deps.curUri}`);
                }

                //assign the event title based on performers
                curEvent.eventTitle = curEvent.performers.filter(x => x.isPrimaryPerformer).map(x => x.performerName).join(" / ");
                if (hasSupportingActs)
                    curEvent.eventTitle += " / " + curEvent.performers.filter(x => !x.isPrimaryPerformer).map(x => x.performerName).join(" / ");


                //get start dt
                let sDate : Date = null;
                let startDate = eventContainer.querySelector('#when meta');
                if (startDate) {
                    sDate = new Date(startDate.getAttribute('content'));
                    sDate = injectedHelpers.correctZeroOffsetDateToLocal(sDate);
                } else {
                    log.errorLogs.push(`Start Date not found in #when meta in detail page for: ${deps.curUri}`);
                }

                //get start time
                let startTime = eventContainer.querySelector('p.time')
                if (sDate && startTime) {
                    let success: boolean = false;
                    let startTimeInfo = startTime.innerText.split('\n');
                    for(let t of startTimeInfo) {
                        if (t.toLowerCase().includes('door')) {
                            [curEvent.rawDoorTimeStr, curEvent.doorTimeHours, curEvent.doorTimeMin ] = injectedHelpers.parseTime(t);
                        } else if (t.toLowerCase().includes('show')) {
                            let [rawString, timeHours, timeMin] = injectedHelpers.parseTime(t);
                            sDate.setHours(timeHours, timeMin);
                            curEvent.startDt = sDate.toISOString();
                            success = true;
                        }
                    }
                    if (!success) {
                        log.errorLogs.push(`Error assigning time to start date in detail page for: ${deps.curUri}`);
                    }
                } else {
                    log.errorLogs.push(`Start Time (or start date) not found in p.time in detail page for: ${deps.curUri}`);
                }

                //get age restriction
                let ageRestriction = eventContainer.querySelector('p.age-restriction');
                if (ageRestriction) {
                    let ageRestrictionTxt = ageRestriction.innerText;
                    if (ageRestrictionTxt.toLowerCase().includes('all')) {
                        curEvent.minAge = 0;
                    } else if (ageRestrictionTxt.includes('18')) {
                        curEvent.minAge = 18;
                    } else if (ageRestrictionTxt.includes('21')) {
                        curEvent.minAge = 21;
                    } else {
                        log.warningLogs.push(`Could not parse age restriction in p.age-restriction in detail page for:  ${deps.curUri}`);
                    }
                } else {
                    log.warningLogs.push(`Age Restriction not found in p.age-restriction in detail page for: ${deps.curUri}`);
                }

                //get price range
                let priceRange = eventContainer.querySelector('#price-range');
                if (priceRange) {
                    let priceRangeTxt = priceRange.innerText;
                    curEvent.ticketCost = injectedHelpers.parseTicketString(priceRangeTxt);
                } else {
                    log.warningLogs.push(`Price range not found in #price-range in detail page for: ${deps.curUri}`);
                }

                //if not already set and location is found, add that too
                let location = eventContainer.querySelector("#event-info");
                if (location && (curEvent.venueAddressLines||[]).length == 0) {
                    for(let line of location.innerText.split('\n').filter(x => x)) {
                        location.push(line);
                    }
                } 

            } else {
                log.errorLogs.push(`Event container not found in #event in detail page for: ${deps.curUri}`);
            }
        }
    }
    catch(e)
    {
        log.errorLogs.push(`Capture Detail Page Exception Thrown: ${e.message} at ${deps.curUri}`);
    }
    
    return [log, curEvent];
};

export const parseEventbrite = async(page: puppeteer.Page, curEvent:models.CaptureEvent, log: models.CaptureLog, deps: any) : Promise<[models.CaptureLog, models.CaptureEvent]> => {
    console.log(`getting detail page: ${deps.curUri}`);
    
    try {
    //browse to the cur event's detail page
    await puppeteerUtils.goto(page, deps.curUri, deps.navSettings);

    //add helpers from parsers module into page
    await puppeteerUtils.injectHelpers(page, [parsers, domUtils], 'injectedHelpers');

    const EVENTBRITE_CONTENT_SELECTOR : string = "div.event-listing__body";
    
    //scrape from container element
    [log, curEvent ] = 
          await page.$$eval<[models.CaptureLog, models.CaptureEvent], models.CaptureEvent, models.CaptureLog, any>(
            EVENTBRITE_CONTENT_SELECTOR, 
            parseEventbriteDetailPageBrowserFn, 
            curEvent,
            log,
            deps);
    } catch (e) {
        log.errorLogs.push(`Error navigating to detail page: ${deps.curUri} : ${e.message} .`);
    } finally {
        return [log, curEvent ];
    }
  
}

let parseEventbriteDetailPageBrowserFn = (detailCtx, curEvent: models.CaptureEvent, log: models.CaptureLog, deps : any): [models.CaptureLog, models.CaptureEvent] => {
    try
    {
        curEvent.detailPageInnerText = document.body.innerText;
        curEvent.detailPageHtml = document.body.innerHTML;

        if (!detailCtx || detailCtx.length < 1) {
            log.errorLogs.push(`Could not find Detail Container Element for page: ${deps.curUri}`);
        }
        else if (detailCtx.length > 0) {
            let curCtx = detailCtx[0];

            //element title
            let eventTitleEl = curCtx.querySelector('h1.listing-hero-title');
            if (eventTitleEl) {
                curEvent.eventTitle = eventTitleEl.innerText.trim();
            } else {
                log.warningLogs.push(`Event Title not found in h1.listing-hero-title in detail page for: ${deps.curUri}`);
            }

            //ignore calendar links: requires javascript

            //get main image
            curEvent.eventImageUris = curEvent.eventImageUris||[];
            let mainImgEl = curCtx.querySelector('div.listing-hero picture source');
            if (mainImgEl) {
                let imgUri = "";
                let candidateImgUri = mainImgEl.getAttribute('srcset').toLowerCase();
                let isDecodableUri = candidateImgUri.match(/^http[s]?:\/\/img.evbuc.com/i);
                if (isDecodableUri && isDecodableUri.length > 0) {
                    let decodedCandidateUri = decodeURIComponent(candidateImgUri);
                    let splitPt = decodedCandidateUri.lastIndexOf('http');
                    imgUri = decodedCandidateUri.substr(splitPt);
                } else {
                    imgUri = candidateImgUri;
                }
                
                if (curEvent.eventImageUris.map(x => x.toLowerCase()).indexOf(imgUri) === -1) {
                    curEvent.eventImageUris.push(imgUri);
                }
            } else {
                log.warningLogs.push(`Main image not found in div.listing-hero picture in detail page for: ${deps.curUri}`);
            }

            //extract ticket price
            let ticketPriceEl = curCtx.querySelector('div.js-display-price');
            if (ticketPriceEl) {
              if (!curEvent.ticketCost || curEvent.ticketCost.length ==0) {
                curEvent.ticketCost = curEvent.ticketCost||[];
                curEvent.ticketCostRaw = ticketPriceEl.innerText; 
                if (curEvent.ticketCostRaw && curEvent.ticketCostRaw.toLowerCase().includes("free")) {
                    curEvent.ticketCost.push(<models.TicketAmtInfo> { amt: 0, qualifier: "" });
                } else {
                    curEvent.ticketCost = <models.TicketAmtInfo[]> injectedHelpers.parseTicketString(curEvent.ticketCostRaw);
                }
              }
            } else {
                log.warningLogs.push(`Ticket price not found in div.js-display-price in detail page for: ${deps.curUri}`);
            }

            //start and end time
            let dtContainerElArray = [...curCtx.querySelectorAll('div.event-details h3.label-primary')].filter(x => x.innerText.toLowerCase().includes("date and time")).map(x => x.parentElement);
            if (dtContainerElArray && dtContainerElArray.length > 0) {
                let dts = [...dtContainerElArray[0].querySelectorAll("div.event-details__data meta")].map(x => new Date(x.getAttribute('content'))).sort((a,b) => a.getTime() - b.getTime());
                curEvent.startDt = dts[0].toISOString();
                if (dts[1])
                    curEvent.endDt = dts[1].toISOString();
            } else {
                log.warningLogs.push(`Start date and time not found in detail page for: ${deps.curUri}`);
            }

            //venue location
            let venueContainerElArray = [...curCtx.querySelectorAll('div.event-details h3.label-primary')].filter(x => x.innerText == "LOCATION").map(x => x.parentElement);
            if (venueContainerElArray && venueContainerElArray.length > 0) { 
                if (!curEvent.venueAddressLines||curEvent.venueAddressLines.length ==0) {
                  curEvent.venueAddressLines = [...venueContainerElArray[0].querySelectorAll("div.event-details__data > p:not(:last-child)")].map(x => x.innerText);
                }
            } else {
                log.warningLogs.push(`Start date and time not found in detail page for: ${deps.curUri}`);
            }

            //geocode
            let geoLinks = document.querySelectorAll("a.js-view-map-link.is-hidden[target='_blank'][href^='https://maps.google.com']");
            if (!!geoLinks && geoLinks.length > 0) {
                let geoHref = geoLinks[0].getAttribute('href');
                let geoHrefQs = geoHref.substr(geoHref.lastIndexOf('?'));
                let geocodeParseResults = [...geoHrefQs.match(/\&q=(.+),(.+)\&sll/)];
                if (geocodeParseResults.length === 3) {
                    curEvent.location = { type: "Point", coordinates:  [ geocodeParseResults[2], geocodeParseResults[1] ]};
                } else {
                    log.warningLogs.push(`Could not parse geocoded link in detail page for: ${deps.curUri}`);    
                }
            } else {
                log.warningLogs.push(`Could not find geocoded link in detail page for: ${deps.curUri}`);
            }
            

            //promoter
            let promoterElem = curCtx.querySelector('#listing-organizer');
            if (promoterElem) {
                let p = { uris: [], desc:'', name:''};
                let promoterLinkElem = promoterElem.querySelector("a[data-automation='organizer-profile-link']");
                if (promoterLinkElem) {
                    p.uris.push(promoterLinkElem.getAttribute('href'));
                    p.name = promoterLinkElem.innerText.replace("ORGANIZER", "").trim();
                }
                p.uris.concat([...promoterElem.querySelectorAll("ul.inline-link-list li a")].map(x => x.getAttribute('href')));
                let desc1Elem = promoterElem.querySelector("p.text-heading-secondary");
                if (desc1Elem)
                    p.desc = desc1Elem.textContent;
                let desc2Elem = promoterElem.querySelector("div.js-xd-read-more-contents p");
                if (desc2Elem)
                    p.desc += desc2Elem.innerText;
                if (curEvent.promoters.findIndex(x => (x.name && x.name.toLowerCase()) != (p.name && p.name.toLowerCase())))
                    curEvent.promoters.push(p);
            } else {
                log.warningLogs.push(`Promoter info not found in detail page for: ${deps.curUri}`);
            }

            //event desc
            let descElem = curCtx.querySelector('div[data-automation="listing-event-description"]');
            if (descElem) {
                curEvent.eventDesc = descElem.innerText;
            } else {
                log.warningLogs.push(`Detailed description not found in detail page for: ${deps.curUri}`);
            } 
            
            //event images
            //TODO- fix Is barfing on image... why not just map and lowercase it here
            curEvent.eventImageUris = curEvent.eventImageUris||[];
            let imgElemArray = [...curCtx.querySelectorAll('div[data-automation="listing-event-description"] img')];
            for(let i = 0; imgElemArray && imgElemArray.length > 0 && i < imgElemArray.length; i++) {
                let curImgSrc = imgElemArray[i].getAttribute('src').toLowerCase();
                if (curEvent.eventImageUris.map(x => x.toLowerCase()).indexOf(curImgSrc) == -1)
                    curEvent.eventImageUris.push(curImgSrc);
            }
        } else {
            log.errorLogs.push(`Event container not found in div.event-listing__body in detail page for: ${deps.curUri}`);
        }
    }
    catch(e)
    {
        log.errorLogs.push(`Capture Detail Page Exception Thrown: ${e.message} at ${deps.curUri}`);
    }
    
    return [log, curEvent];
};

export const parseRichmondShows = async(page: puppeteer.Page, curEvent:models.CaptureEvent, log: models.CaptureLog, deps: any) : Promise<[models.CaptureLog, models.CaptureEvent]> => {    
    try {
    //browse to the cur event's detail page
    await puppeteerUtils.goto(page, deps.curUri, deps.navSettings);

    //add helpers from parsers module into page
    await puppeteerUtils.injectHelpers(page, [parsers, domUtils], 'injectedHelpers');

    const RICHMONDSHOWS_CONTENT_SELECTOR : string = "div.entry-content article.event-detail";
    
    //scrape from container element
    [log, curEvent ] = 
          await page.$$eval<[models.CaptureLog, models.CaptureEvent], models.CaptureEvent, models.CaptureLog, any>(
            RICHMONDSHOWS_CONTENT_SELECTOR, 
            parseRichmondShowsDetailPageBrowserFn, 
            curEvent,
            log,
            deps);
    } catch (e) {
        log.errorLogs.push(`Error navigating to detail page: ${deps.curUri} : ${e.message} .`);
    } finally {
        return [log, curEvent ];
    }
  
}

let parseRichmondShowsDetailPageBrowserFn = (detailCtx, curEvent: models.CaptureEvent, log: models.CaptureLog, deps : any): [models.CaptureLog, models.CaptureEvent] => {  
  try
  {    
    curEvent.detailPageInnerText = document.body.innerText;
    curEvent.detailPageHtml = document.body.innerHTML;
    
    if (!detailCtx || detailCtx.length < 1) {
      log.errorLogs.push(`Could not find Detail Container Element for page: ${deps.curUri}`);
    }
    else if (detailCtx.length > 0) {
      //start with the ld+json
      let ldSuccess = false, ldEvent:any;
      let ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map(x => JSON.parse(x.innerText)).map(x => Array.isArray(x) ? x[0] : x);
      if (ld && ld.length > 0 ) {
        let ldEventArray = ld.filter(x => x['@type'] == 'Event');
        if (ldEventArray && ldEventArray.length > 0) {
          ldEvent = ldEventArray[0];
          ldSuccess = true;
        } 
      }
      if (!ldSuccess) {
        throw new Error(`Could not extract json+ld event data (@Type=='Event')`);
      } 

      if (ldEvent.startDate) {
        curEvent.startDt = new Date(ldEvent.startDate).toISOString();
      } else {
        throw new Error(`Could not extract startDt from json+ld event data (@Type=='Event')`);
      }

      if (ldEvent.endDate) {
        curEvent.endDt = new Date(ldEvent.endDate).toISOString();
      } else {
        log.warningLogs.push(`No endDt from json+ld for page: ${deps.curUri}`);
      }

      if (ldEvent.image) {        
        curEvent.eventImageUris.push(ldEvent.image);            
      } else {
        log.warningLogs.push(`No main image found from json+ld for page: ${deps.curUri}`);
      }

      if (ldEvent.ageRange && ldEvent.typicalAgeRange === "all_ages") {
        curEvent.minAge = 0;
      }

      if (ldEvent.offers && ldEvent.offers.url && !curEvent.ticketUri) {
        curEvent.ticketUri = ldEvent.offers.url;
      }

      if (ldEvent.location && ldEvent.location.name && !curEvent.venueName) {
        curEvent.venueName = ldEvent.location.name;
      }

      if ((!curEvent.venueAddressLines || curEvent.venueAddressLines.length === 0) && ldEvent.location && ldEvent.location["@type"]=== 'Place') {
        curEvent.venueAddressLines.push(ldEvent.location.streetAddress as string, ldEvent.location.addressLocality  as string, ldEvent.location.addressRegion as string, ldEvent.location.postalCode as string)
      }
      
      if (ldEvent.doorTime) {
        let doorTime = new Date(ldEvent.doorTime);
        curEvent.doorTimeHours = doorTime.getHours();
        curEvent.doorTimeMin = doorTime.getMilliseconds();
      }
      
      let curCtx = detailCtx[0];

      //promoter, if exists
      let promoterElem = curCtx.querySelector('h2.topline-info');
      if (promoterElem) {
        curEvent.promoters.push({ name: promoterElem.innerText, desc: '', uris: []})
      }

      //venue address/info, if exists and not already set
      let venueElem = curCtx.querySelector('div.venue-info');
      if (venueElem && (!curEvent.venueAddressLines || curEvent.venueAddressLines.length == 0)) {
        curEvent.venueAddressLines.push( ...((venueElem.innerText.replace("Venue Information:\n", "").split("\n").filter(x => x))||[]) );
      }

      //start date and time
      let startDtElem = curCtx.querySelector('span.start.dtstart span.value-title');
      if (startDtElem && !curEvent.startDt) {
        let actualStartDt = new Date(startDtElem.getAttribute('title'));
        if (startDtElem) {
          curEvent.startDt = actualStartDt.toISOString();
        } else {
          log.errorLogs.push(`Could not find start date from span.start.dtstart span.value-title on page: ${deps.curUri}`);
        }
      }

      //per the policy stated here https://www.thecamel.org/faq/
      //unless otherwise noted, sun-thurs is all ages, fri-sat are 18+
      // if (curEvent.minAge === null && actualStartDt.getDay() <= 4) {
      //   curEvent.minAge = 0;
      // } else if (curEvent.minAge === null && actualStartDt.getDay() > 4) {
      //   curEvent.minAge = 18;
      // }
      
      //get main image (first from ld)
      // let imgItem = curCtx.querySelector("img:first-child");
      // if (imgItem)
      // {
      //   let imageUri = imgItem.getAttribute("src").trim();  
      //   if (curEvent.eventImageUris.indexOf(imageUri) === -1) {
      //     curEvent.eventImageUris.push(imageUri);
      //   }    
      // } else {
      //   log.warningLogs.push(`Expecting first child of div.event-detail to be an image for page: ${deps.curUri}`);
      // }

      //name of main performer
      let mainPerformer :string = '';
      let mainPermElem = curCtx.querySelector('.event-info .headliners');
      if (mainPermElem) {
        mainPerformer = mainPermElem.innerText.trim();
      } else {
        log.warningLogs.push(`Expecting to find a main performer (h1.headliners.summary) for page: ${deps.curUri}`);
      }

      //get doors
      let doorElem = curCtx.querySelector('h2.times span.doors');
      if (doorElem) {
        let doorTxt = doorElem.innerText.trim();
        [curEvent.rawDoorTimeStr, curEvent.doorTimeHours, curEvent.doorTimeMin ] = injectedHelpers.parseTime(doorTxt);
      } else {
        log.infoLogs.push(`No door info found in h2.times span.doors in div.event-detail for page: ${deps.curUri}`);
      }

      if (!curEvent.ticketCostRaw) {
        let tixPriceElem = curCtx.querySelector('.ticket-price .price-range');
        if (tixPriceElem) {
          let rawTixPriceTxt = tixPriceElem.innerText.trim();
          curEvent.ticketCostRaw = rawTixPriceTxt;
          curEvent.ticketCost = <models.TicketAmtInfo[]> injectedHelpers.parseTicketString(rawTixPriceTxt);
        } else {
          log.infoLogs.push(`No ticket info found in h2.times span.doors in div.event-detail for page: ${deps.curUri}`);
        }
      }
      
      let fbShareElem = curCtx.querySelector('.share-events.share-plus .share-facebook a:first-child');
      if (fbShareElem) {
        curEvent.facebookShareUri = fbShareElem.getAttribute("href");
      } else {
        log.infoLogs.push(`No FB Share info found in .share-events.share-plus .share-facebook a:first-child for page: ${deps.curUri}`);
      }

      let twitterShareElem = curCtx.querySelector('.share-events.share-plus .share-twitter a:first-child');
      if (twitterShareElem) {
        curEvent.twitterShareUri = twitterShareElem.getAttribute("href");
      } else {
        log.infoLogs.push(`No Twitter Share info found in .share-events.share-plus .share-twitter a:first-child for page: ${deps.curUri}`);
      }

      let iCalElem = curCtx.querySelector('.ical-sync a');
      if (iCalElem) {
        curEvent.iCalUri = iCalElem.getAttribute("href");
      } else {
        log.infoLogs.push(`No iCal info found in  for page: ${deps.curUri}`);
      }

      let gCalElem = curCtx.querySelector('.gcal-sync a');
      if (gCalElem) {
        curEvent.gCalUri = gCalElem.getAttribute("href");
      } else {
        log.infoLogs.push(`No gCal info found in  for page: ${deps.curUri}`);
      }

      let artistBoxCtx = curCtx.querySelectorAll("div.artist-boxes div.artist-box-headliner, div.artist-boxes div.artist-box-support");
      for (let artistBoxElem of artistBoxCtx||[]) {
        let performerNameElem = artistBoxElem.querySelector('span.artist-name');
        if (performerNameElem) {

        let curPerformer = <models.CapturePerformer> { 
          performerName: performerNameElem.innerText.trim(),
          performerUris: [],
          performerImageUris: []
        };

        curPerformer.isPrimaryPerformer = mainPerformer.toLowerCase()==curPerformer.performerName.toLowerCase();

        let linksCtx = artistBoxElem.querySelectorAll('ul.tfly-more li a');
        for(let linkElem of linksCtx||[]) {
          let link = linkElem.getAttribute('href');
          if (!link.match(/^#\w+/)) {
            curPerformer.performerUris.push(link);
          }
        }

        //get performer bio image
        let bioImgElem1 = artistBoxElem.querySelector('img.bio-image-right');
        let bioImgElem2 = artistBoxElem.querySelector('img.bio-image-no-float');
        let bioImgElem = bioImgElem1||bioImgElem2;
        if (bioImgElem) {
          curPerformer.performerImageUris.push(bioImgElem.getAttribute("src"));
        } else {
          log.infoLogs.push(`No Performer image found in img.bio-image-right for ${curPerformer.performerName} for page: ${deps.curUri}`);
        }

        //get performer bio
        let bioElem = artistBoxElem.querySelector('div.bio');
        if (bioElem) {
          curPerformer.performerDesc = bioElem.innerText.trim();
        } else {
          log.infoLogs.push(`No Performer Bio found in div.bio for ${curPerformer.performerName} for page: ${deps.curUri}`);
        }

        curEvent.performers.push(curPerformer);
        } else {
        log.warningLogs.push(`No Performer Name in Artist Box for page: ${deps.curUri}`);
        }
      }
      //get any performer info if there's no dedicated artist box
      let performerDoubleCheck = 
        ([...curCtx.querySelectorAll('div.event-info h1.headliners, div.event-info h2.supports')]
        .map((x,i) => { 
          return {
            performerName: x.innerText.trim(),
            performerUris: [],
            performerImageUris: [],
            isPrimaryPerformer: i ==0
          } as CapturePerformer
          } ));
      for(let p of performerDoubleCheck) {
        if (curEvent.performers.findIndex(x => x.performerName.toLowerCase()==p.performerName.toLowerCase()) == -1) {
          curEvent.performers.push(p);
        }
      }
    } else if (detailCtx.length > 1) {
      log.warningLogs.push(`Expected only 1 Detail Container Element, but there are ${detailCtx.length} for page: ${deps.curUri}`);
    } 
  }
  catch(e) {
    log.errorLogs.push(`Capture Detail Page Exception Thrown: ${e.message} at ${deps.curUri}`);
  }
  
  return [log, curEvent];
};

export const parseMainCamelPageBrowserFn = (daysCtx, results, log, deps): [models.CaptureLog, models.CaptureResults] => {  
  try {    
    //get each day w >= 1 event
    for (let dayItem of daysCtx||[]) {      
      //get each event
      let eventsCtx = dayItem.querySelectorAll(deps.eventSelector);
      for (let eventItem of eventsCtx||[]) {
        let event = <models.CaptureEvent> {
          tenantName: deps.channelCfg.TENANT_NAME,
          channelName: deps.channelCfg.CHANNEL_NAME,
          channelImage: deps.channelCfg.CHANNEL_IMAGE,
          channelBaseUri: deps.channelCfg.PRIMARY_URI,
          venueName: deps.channelCfg.VENUE_NAME,
          performers: [] as models.CapturePerformer[],
          eventImageUris: [] as string[],
          eventUris: [] as models.UriType[],
          miscDetail: [] as string[],
          unparsedDetail: [] as string[],
          ticketCost: [] as models.TicketAmtInfo[],
          venueAddressLines: deps.channelCfg.VENUE_ADDRESS ? deps.channelCfg.VENUE_ADDRESS : [],
          venueContactInfo: deps.channelCfg.VENUE_PHONENUM ? [ { item: deps.channelCfg.VENUE_PHONENUM, itemType: deps.CONTACT_ITEM_TYPES.PHONE }] : [],
          eventContactInfo: [] as models.ContactInfoItem[],
          minAge: null,
          rawDoorTimeStr: null,
          doorTimeHours: null,
          doorTimeMin: null,
          promoters: [] as models.PromoterInfo[],
          neighborhood: deps.neighborhood       
        };
        
        //get headliners
        let titleSegments = [];
        let headlinersLinkCtx = eventItem.querySelectorAll("h1.headliners");
        for (let headlinerLinkItem of headlinersLinkCtx||[]) {
          let isPrimary = headlinerLinkItem.classList.contains('summary');
          let linkElement = headlinerLinkItem.querySelector('a:first-child');
          let eventUri :models.UriType = { uri: linkElement.getAttribute("href").trim(), isCaptureSrc: true};
          if (eventUri.uri) {
            eventUri.uri = deps.channelCfg.DOMAIN_NAME + eventUri.uri;
          }
          let performerName = linkElement.innerText.trim();
          let testExist = (el:models.CapturePerformer)=> el.performerName==performerName;
          
          if (event.eventUris.map(x => x.uri).indexOf(eventUri.uri) === -1) {
            event.eventUris.push(eventUri);
          }              
          if (titleSegments.findIndex(testExist) === -1) {
            titleSegments.push(performerName);
          }
        }

        // test if at broadberry
        let venueElem = eventItem.querySelector('h2.venue.location');
        if (venueElem) {
            if (venueElem.innerText.match(/broadberry/i)) {
                event.venueName = deps.channelCfg.VENUE_NAME;
            }
        }

        //get supporting acts
        let supporterLinkCtx = eventItem.querySelectorAll("h2.supports a");
        for (let supporterLinkItem of supporterLinkCtx||[]) {
          let eventUri :models.UriType = { uri: supporterLinkItem.getAttribute("href").trim(), isCaptureSrc: true};
          if (eventUri.uri) {
            eventUri.uri = deps.channelCfg.DOMAIN_NAME + eventUri.uri;
          }

          let performerName = supporterLinkItem.innerText.trim();
          let testExist = (el:models.CapturePerformer)=> el.performerName==performerName;

          if (event.eventUris.map(x => x.uri).indexOf(eventUri.uri) === -1) {
            event.eventUris.push(eventUri);
          }
          if (titleSegments.findIndex(testExist) === -1) {
            titleSegments.push(performerName);
          }
        }

        event.eventTitle = titleSegments.join(" / ");

        //ticket link
        let ticketsLink = eventItem.querySelector("h3.ticket-link a");
        if (ticketsLink) {
          event.ticketUri = ticketsLink.getAttribute("href");
          if (event.eventUris.map(x => x.uri).indexOf(event.ticketUri) === -1) {
            event.eventUris.push({ uri: event.ticketUri, isCaptureSrc: false});
          }
        }

        //free events adv on the calendar, more ticket info is on the detail page
        let isFree = eventItem.querySelector("h3.free");
        if (isFree) {
          event.ticketCostRaw = "Free";
          event.ticketCost.push(<models.TicketAmtInfo> { amt: 0, qualifier: "" });
        }
        
        if (eventItem.querySelector('h2.age-restriction.all-ages')) {
          event.minAge = 0;
        } else if (eventItem.querySelector('h2.age-restriction.over-21')) {
          event.minAge = 21;
        }

        results.events.push(event);
      } //event loop
    } //day loop
  }
  catch(e) {
    log.errorLogs.push(`Capture Main Page Exception Thrown: ${e.message}`);
  }

  return [log, results];
}


export const parseStyleWeeklyPageBrowserFn = (daysCtx, results, log, deps): [models.CaptureLog, models.CaptureResults] => {  
  try {    
    //get each event
    for (let eventItem of daysCtx||[]) {      
            
      let event = <models.CaptureEvent> {
        tenantName: deps.channelCfg.TENANT_NAME,
        channelName: deps.channelCfg.CHANNEL_NAME,
        channelImage: deps.channelCfg.CHANNEL_IMAGE,
        channelBaseUri: deps.channelCfg.PRIMARY_URI,
        venueName: null,
        performers: [] as models.CapturePerformer[],
        eventImageUris: [] as string[],
        eventUris: [] as models.UriType[],
        miscDetail: [] as string[],
        unparsedDetail: [] as string[],
        ticketCost: [] as models.TicketAmtInfo[],
        ticketCostRaw: null,
        venueAddressLines: [],
        venueContactInfo: [],
        eventContactInfo: [] as models.ContactInfoItem[],
        minAge: null,
        rawDoorTimeStr: null,
        doorTimeHours: null,
        doorTimeMin: null,
        promoters: [] as models.PromoterInfo[],
        neighborhood: null
      };
      
      //event title
      let eventTitleElem = eventItem.querySelector("div.listing > h3 > a");
      if (eventTitleElem) {
        event.eventTitle = eventTitleElem.innerText;
        event.eventUris.push({ uri: eventTitleElem.getAttribute('href'), isCaptureSrc: true })
      } else {
        log.errorLogs.push(`Cannot get event title for Style weekly page.`);     
        continue;   
      }

      //neighborhood tag
      let neighborhoodElem = eventItem.querySelector("div.listing div.descripTxt span.locationRegion a");
      if (neighborhoodElem) {
        event.neighborhood = neighborhoodElem.innerText;
      }

      //contact phone
      let phoneElem = eventItem.querySelector("div.listing div.descripTxt.longDescrip span.locationPhone");
      if (phoneElem) {
        event.eventContactInfo.push({ itemType: deps.CONTACT_ITEM_TYPES.PHONE, item: phoneElem.innerText});
      }

      //get info from ld+json    
      let ldSuccess = false, ldEvent:any;
      let ld = [...eventItem.querySelectorAll('script[type="application/ld+json"]')].map(x => JSON.parse(x.innerText)).map(x => Array.isArray(x) ? x[0] : x);
      if (ld && ld.length > 0 ) {
        let ldEventArray = ld.filter(x => x['@type'] == 'Event');
        if (ldEventArray && ldEventArray.length > 0) {
          ldEvent = ldEventArray[0];
          ldSuccess = true;
        } 
      }
      if (!ldSuccess) {
        log.errorLogs.push(`Could not extract json+ld event data (@Type=='Event'.`);     
        continue;          
      } 
      
      if (ldEvent.startDate) {
        // arrgghh... this is terrible fix todo
        let sd = new Date(ldEvent.startDate);
        sd.setHours(sd.getHours()+5);
        event.startDt = sd.toISOString();                
      } else {
        log.errorLogs.push(`Could not extract startDt from json+ld event data (@Type=='Event'.`);     
        continue;          
      }

      if (ldEvent.endDate) {
        // arrgghh... this is terrible fix todo
        let ed = new Date(ldEvent.endDate);
        ed.setHours(ed.getHours()+5);
        event.endDt = ed.toISOString();                        
      } 

      //if start date is in the past, assume this is because it's a regularly scheduled event which is hard-noped atm
      let recordedStartDate = new Date(event.startDt);
      let yesterday = new Date();
      yesterday.setDate(new Date().getDate() - 1);
      if (recordedStartDate < yesterday) {
        log.infoLogs.push(`Event '${event.eventTitle}' appears to be recurrent - which are not currently handled`);     
        continue;          
      }

      if (ldEvent.location && ldEvent.location.name) {
        event.venueName = ldEvent.location.name;
      }

      if (ldEvent.location && ldEvent.location.address) {
        event.venueAddressLines=ldEvent.location.address.split(',');
      }

      if (ldEvent.url) {
        event.eventUris.push({ isCaptureSrc: false, uri: decodeURI(ldEvent.url) })
      }

      if (ldEvent.image && ldEvent.image.url) {
        event.eventImageUris.push(decodeURI(ldEvent.image.url))
      }

      if (ldEvent.description) {
        event.eventDesc = ldEvent.description;
      }      

      results.events.push(event);
    } //event loop    
  }
  catch(e) {
    log.errorLogs.push(`Capture Main Page Exception Thrown: ${e.message}`);
  }

  return [log, results];
}

export const parseStyleWeekly = async(page: puppeteer.Page, curEvent:models.CaptureEvent, log: models.CaptureLog, deps: any) : Promise<[models.CaptureLog, models.CaptureEvent]> => {    
  try {
  //browse to the cur event's detail page
  await puppeteerUtils.goto(page, deps.curUri, deps.navSettings);

  //add helpers from parsers module into page
  await puppeteerUtils.injectHelpers(page, [parsers, domUtils], 'injectedHelpers');

  const STYLEWEEKLY_CONTENT_SELECTOR : string = "#EventMetaData";
  
  //scrape from container element
  [log, curEvent ] = 
        await page.$$eval<[models.CaptureLog, models.CaptureEvent], models.CaptureEvent, models.CaptureLog, any>(
          STYLEWEEKLY_CONTENT_SELECTOR, 
          parseStyleWeeklyDetailPageBrowserFn, 
          curEvent,
          log,
          deps);
  } catch (e) {
      log.errorLogs.push(`Error navigating to detail page: ${deps.curUri} : ${e.message} .`);
  } finally {
      return [log, curEvent ];
  }

}

let parseStyleWeeklyDetailPageBrowserFn = (detailCtx, curEvent: models.CaptureEvent, log: models.CaptureLog, deps : any): [models.CaptureLog, models.CaptureEvent] => {  
try
{  
  debugger;  
  curEvent.detailPageInnerText = null;
  curEvent.detailPageHtml = null;
  
  if (!detailCtx || detailCtx.length < 1) {
    log.errorLogs.push(`Could not find Detail Container Element for page: ${deps.curUri}`);
  }
  else if (detailCtx.length === 1) {
    let curCtx = detailCtx[0];
    if (!curEvent.ticketCostRaw) {
      let tixPriceElem = curCtx.querySelector('span.eventInfo.eventPrice');
      if (tixPriceElem) {
        let rawTixPriceTxt = tixPriceElem.innerText.trim();
        curEvent.ticketCostRaw = rawTixPriceTxt;
        curEvent.ticketCost = <models.TicketAmtInfo[]> injectedHelpers.parseTicketString(rawTixPriceTxt);
      } else {
        log.infoLogs.push(`No ticket info found for page: ${deps.curUri}`);
      }
    }
    
    // let fbShareElem = curCtx.querySelector('.share-events.share-plus .share-facebook a:first-child');
    // if (fbShareElem) {
    //   curEvent.facebookShareUri = fbShareElem.getAttribute("href");
    // } else {
    //   log.infoLogs.push(`No FB Share info found in .share-events.share-plus .share-facebook a:first-child for page: ${deps.curUri}`);
    // }

    // let twitterShareElem = curCtx.querySelector('.share-events.share-plus .share-twitter a:first-child');
    // if (twitterShareElem) {
    //   curEvent.twitterShareUri = twitterShareElem.getAttribute("href");
    // } else {
    //   log.infoLogs.push(`No Twitter Share info found in .share-events.share-plus .share-twitter a:first-child for page: ${deps.curUri}`);
    // }
    
  } else if (detailCtx.length > 1) {
    log.warningLogs.push(`Expected only 1 Detail Container Element, but there are ${detailCtx.length} for page: ${deps.curUri}`);
  } 
}
catch(e) {
  log.errorLogs.push(`Capture Detail Page Exception Thrown: ${e.message} at ${deps.curUri}`);
}

return [log, curEvent];
};

