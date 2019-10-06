import { link } from 'fs';
import { ProgramItem } from './../../core/models';
declare const injectedHelpers : any; 
declare const document : any;

export const CAPTURE_KEY : string = 'richmondSymphony';

import {puppeteer, puppeteerUtils, apiClient, models, parsers, domUtils, captureHelpers, awsHelpers, screenshots } from '../../barrel';
import { CFG } from '../../config';

let envCfg = CFG[process.env.NODE_ENV || "development"];
let channelCfg = CFG[CAPTURE_KEY];

export async function main() {

  let bundledRuntimeDependencies : any = {
    channelCfg: channelCfg,
    curUri: channelCfg.PRIMARY_URI,
    CONTACT_ITEM_TYPES: models.CONTACT_ITEM_TYPES,
    eventSelector: channelCfg.DAY_EVENT_SELECTOR
  };

  let curDate : string = new Date().toISOString();

  //init return values
  let results : models.CaptureResults = {
    tenantName: channelCfg.TENANT_NAME,
    channelName: channelCfg.CHANNEL_NAME,
    channelBaseUri: channelCfg.PRIMARY_URI,
    captureDt: curDate,
    events: [] as models.CaptureEvent[],
  };

  let log : models.CaptureLog = {
    tenantName: channelCfg.TENANT_NAME,
    channelName: channelCfg.CHANNEL_NAME,
    channelBaseUri: channelCfg.PRIMARY_URI,
    logDt: curDate,
    mostRecentScreenShot: null,
    errorLogs: [] as string[],
    warningLogs: [] as string[],
    infoLogs: [] as string[],
    totalCapturedEvents: 0
  };

  try {
    //set up puppeteer and navigate to page
    const [browser, page] = await puppeteerUtils.init({ debug: envCfg.debug, uri: channelCfg.PRIMARY_URI, width: 1024, height: 800}, channelCfg.NAV_SETTINGS);

    //add helpers from parsers module into page
    await puppeteerUtils.injectHelpers(page, [parsers], 'injectedHelpers');
    
    //collect detail pages      
    let detailUris = await collectDetailUris(page, true);   //page fwd
    await puppeteerUtils.goto(page, channelCfg.PRIMARY_URI, channelCfg.NAV_SETTINGS);
    if (channelCfg.VIEW_PAST_EVENTS) 
      detailUris = await collectDetailUris(page, false); //page back

    log = await screenshots.doScreenshot(log, page, channelCfg.PRIMARY_URI, envCfg.s3BucketName);
      
    let i = 0;
    let _keys = [] as string[];
    //scrape each detail page uri
    for(let detailPageUri of detailUris) {
      console.log(`scraping ${i++} of ${detailUris.length}`);
      [log, results, _keys] = await scrapeDetails(detailPageUri, log, results, page, channelCfg, _keys);    
    }
    
    console.log(_keys.join(' / '));

    //post-processing: remove any events with no dates
    results.events = results.events.filter(val => val.startDt);
    log.totalCapturedEvents = results.events.length;

    if (envCfg.persistImagesToAws)
      [ log, results ] = await awsHelpers.persistImagesToAws(log, results, envCfg.s3BucketName);
    
  } catch (e) {
    log.errorLogs.push(`Top-Level Capture Page Exception Thrown: ${e.message} at ${channelCfg.PRIMARY_URI}`);
  } finally {
    captureHelpers.outputLog(log); 
  }
    
  let testHttp = await apiClient.postCaptureResults(log, results);

  return 0;

}

let collectDetailUris = async(page: puppeteer.Page, pageFwd : boolean) : Promise<string[]> => {
  let isLastPage : boolean = false;
  let detailUris = [] as string[];
  
  //give it a chance to load
  await page.waitFor(5000);

  do {
    //get detail pages
    let newDetailUris = await page.evaluate(
      (eventSelector: string): string[] => [...document.querySelectorAll(eventSelector)].map(x => x.getAttribute('href')),
      "h3.entry-title a.url"
    );
    
    if (newDetailUris && newDetailUris.length) {
      detailUris.push(...(newDetailUris.filter(x => detailUris.indexOf(x) == -1)));
    } else {
      isLastPage = true;
      break;
    }
    
    //page forward
    if (!isLastPage)
      console.log(`Paging ${pageFwd?"forward":"backward"}...`)

    isLastPage = isLastPage||
      (await page.evaluate(
        (buttonSelector) : boolean => {
          let pagerElem = document.querySelector(buttonSelector);
          if (pagerElem) {
            pagerElem.click();
            return false;
          } 
          return true;
        }, 
        pageFwd ? 'a[rel="next"]' : 'a[rel="prev"]'));
    
    //give it a chance to load
    await page.waitFor(3000);
    
  } while (!isLastPage)

  return detailUris;
};

let scrapeDetails = async(uri:string, log: models.CaptureLog, results: models.CaptureResults, page: puppeteer.Page, channelCfg: any, _keys:string[]) : Promise<[models.CaptureLog, models.CaptureResults, string[] ]> => {
  //browse to the cur event's detail page
  await puppeteerUtils.goto(page, uri, channelCfg.NAV_SETTINGS);

  //give it a chance to load
  await page.waitFor(5000);

  //add helpers from parsers module into page
  await puppeteerUtils.injectHelpers(page, [parsers, domUtils], 'injectedHelpers');
  
  //scrape from within browser context
  let curEvent;
  [log, curEvent,  _keys ] = await page.evaluate(parseRichmondSymphonyDetailPageBrowserFn, uri, log, channelCfg, _keys);
  results.events.push(curEvent);

  return [log, results, _keys];
};

let parseRichmondSymphonyDetailPageBrowserFn = (curUri:string, log: models.CaptureLog, channelCfg : any, _keys : string[]) : [models.CaptureLog, models.CaptureEvent, string[]] => {
  console.log('running on page: ' + curUri);
  let event = <models.CaptureEvent> { };
  try {
    event = <models.CaptureEvent> {
      tenantName: channelCfg.TENANT_NAME,
      channelName: channelCfg.CHANNEL_NAME,
      channelImage: channelCfg.CHANNEL_IMAGE,
      channelBaseUri: channelCfg.PRIMARY_URI,
      venueName: channelCfg.VENUE_NAME,
      performers: [] as models.CapturePerformer[],
      eventImageUris: [] as string[],
      eventUris: [{uri: curUri, isCaptureSrc: true}] as models.UriType[],
      miscDetail: [] as string[],
      unparsedDetail: [] as string[],
      ticketCost: [] as models.TicketAmtInfo[],
      venueAddressLines: [],
      venueContactInfo: [],
      eventContactInfo: [] as models.ContactInfoItem[],
      minAge: null,
      rawDoorTimeStr: null,
      doorTimeHours: null,
      doorTimeMin: null,
      promoters: [] as models.PromoterInfo[],
      program: [] as models.ProgramItem[],
      detailPageInnerText: document.body.innerText,
      detailPageHtml: document.body.innerHTML
    };
    
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
    
    event.startDt = new Date(ldEvent.startDate).toISOString();
    event.endDt = new Date(ldEvent.endDate).toISOString();
    event.eventImageUris.push(ldEvent.image);
    event.eventTitle = ldEvent.name.replace(/^\&\#\d+\;/,"").replace(/\&\#\d+\;\s*$/,"");
    event.venueAddressLines = [ldEvent.location.address.streetAddress, `${ldEvent.location.address.addressLocality}, ${ldEvent.location.address.addressRegion}, ${ldEvent.location.address. postalCode}`];
    event.venueName = ldEvent.location.name;
    if (ldEvent.location.geo) {
      event.location = { type: "Point", coordinates:  [ldEvent.location.geo.longitude, ldEvent.location.geo.latitude]};
    } else {
      log.warningLogs.push(`Missing geocode information at ${curUri}`);
    }
        
    //get desc
    event.eventDesc = [...document.querySelectorAll('div.content-wrapper > p')].filter(x => !x.querySelector('a:first-child')).map(x => x.innerText.trim()).filter(x => x).join('  ');

    //TODO: if the p only contains an embedded anchor, then that's a learn-more link to be added somewhere else. ex: 'Learn more about...'

    //google and ical exports
    let gCalElem = document.querySelector('a.tribe-events-gcal');
    if (gCalElem) {
      event.gCalUri = gCalElem.getAttribute('href');
    }
    let iCalElem = document.querySelector('a.tribe-events-ical');
    if (iCalElem) {
      event.iCalUri = iCalElem.getAttribute('href');
    }
    
    let ticketElem = document.querySelector('a.ticket-link');
    if (ticketElem) {
      event.ticketUri = ticketElem.getAttribute('href');
    }
    
    //note: cost is widely variable and on another page.  skip!

    let kvPairs = [...document.querySelectorAll('div.content-wrapper ul li.-list-item')]
      .map(x => ({ k: x.querySelector('span.-label').innerText, v: x.querySelector('span.-value').innerText }))
      .filter(x => ["DATE","TIME","VENUE"].indexOf(x.k) == -1);
    
    for(let i = 0; i < kvPairs.length; i++) {
      if (_keys.indexOf(kvPairs[i].k) == -1) {
        _keys.push(kvPairs[i].k);
      }

      switch(kvPairs[i].k.toUpperCase()) {
        case "TICKET PRICING":
          event.ticketCostRaw = kvPairs[i].v;
          break;
        case "CONDUCTOR":
        case "VIOLIN":
        case "GUEST ARTIST":
        case "GUEST CONDUCTOR":
        case "PIANO":
        case "GUEST ARTISTS":
        case "MEZZO-SOPRANO":
          event.performers.push({ performerName: kvPairs[i].v, performerRole: kvPairs[i].k, performerUris: [], performerImageUris: []} as models.CapturePerformer)
          break;
        default:
          event.program.push({ composer: kvPairs[i].k, title: kvPairs[i].v} as models.ProgramItem)
      }
    }
    
  } catch(e) {
    log.errorLogs.push(`Capture Detail Page Exception Thrown: ${e.message} at ${curUri}`);
  }

  return [log, event, _keys];
}

