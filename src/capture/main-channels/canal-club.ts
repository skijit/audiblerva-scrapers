export const CAPTURE_KEY : string = 'canalClub';
declare const injectedHelpers : any, document : any;

import { puppeteer, puppeteerUtils, apiClient, models, parsers, domUtils, captureHelpers, awsHelpers, screenshots } from '../../barrel';
import { CFG } from '../../config';
import { CapturePerformer, UriType } from '../../core/models';
import { fstat, link } from 'fs';

let envCfg = CFG[process.env.NODE_ENV || "development"];
let channelCfg = CFG[CAPTURE_KEY];

export async function main() {

  let bundledRuntimeDependencies : any = {
    channelCfg: channelCfg,
    curUri: channelCfg.PRIMARY_URI,
    CONTACT_ITEM_TYPES: models.CONTACT_ITEM_TYPES,
    eventSelector: channelCfg.MAIN_PAGE_EVENT_SELECTOR,
    navSettings: channelCfg.NAV_SETTINGS,
    coordinates: { type: "Point", coordinates: channelCfg.COORDINATES},
    neighborhood: channelCfg.NEIGHBORHOOD
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
    const [browser, page] = await puppeteerUtils.init({ debug: envCfg.debug, uri: channelCfg.PRIMARY_URI}, channelCfg.NAV_SETTINGS);

    //add helpers from parsers module into page
    await puppeteerUtils.injectHelpers(page, [parsers, domUtils], 'injectedHelpers');

    //capture from main page
    [log, results] = await 
      page.$$eval<[models.CaptureLog, models.CaptureResults], models.CaptureResults, models.CaptureLog, any>(
        channelCfg.DAY_EVENT_SELECTOR, 
        parseMainPageBrowserFn,
        results,
        log,
        bundledRuntimeDependencies
    ); //day eval
    
    console.log(`identified ${results.events.length} events`);

    log = await screenshots.doScreenshot(log, page, channelCfg.PRIMARY_URI, envCfg.s3BucketName);
    
    //Walk through each event in the results and navigate to its detail page
    for(let i = 0; results.events.length > 0 && i < results.events.length; i++) {
      let curEvent = results.events[i];
      //take only first event detail page (if exists)
      if (curEvent.eventUris && curEvent.eventUris.length > 0) {
        let eventDetailUri = curEvent.eventUris.filter(x => x.isCaptureSrc)[0];
        bundledRuntimeDependencies.curUri = eventDetailUri.uri;

        //scrape details page
        bundledRuntimeDependencies.curUri = eventDetailUri.uri;
        [log, curEvent] = await scrapeDetailPage(page, curEvent, log, bundledRuntimeDependencies);

        results.events[i] = curEvent;
      } //if event has detail page
    } //for each event

    captureHelpers.removeEventsWithMissingDates(results, log);
    log.totalCapturedEvents = results.events.length;
    
    if (envCfg.persistImagesToAws)
      [ log, results ] = await awsHelpers.persistImagesToAws(log, results, envCfg.s3BucketName);
   
  } catch (e) {
    log.errorLogs.push(`Top-Level Capture Page Exception Thrown: ${e.message} at ${channelCfg.PRIMARY_URI}`);
  } finally {
    captureHelpers.outputLog(log);
  }
  
  let testHttp = await apiClient.postCaptureResults(log, results);
  // console.log("------------------\n\n\n", results);
  // console.log(JSON.stringify(results, null, 2))

  return 0;
}; //main

let parseMainPageBrowserFn = (daysCtx, results, log, deps): [models.CaptureLog, models.CaptureResults] => {
  try
  {
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
          location: deps.coordinates,
          neighborhood: deps.neighborhood         
        };

        // get main title, performers, and detail page uri (same as ticket uri)
        let info = eventItem.querySelector(".artist-info");
        if (info) {
          event.eventTitle = info.innerText.trim();
          let performerElem = info.querySelector("h1 a");
          let performerName = event.eventTitle.split(':')[0].trim(); // Artist: Event/Tour Name
          event.performers.push({ performerName: performerName, isPrimaryPerformer: true, performerUris: [], performerImageUris: []} as CapturePerformer);
          event.eventUris.push({ uri: performerElem.getAttribute('href'), isCaptureSrc: true} as UriType);
          event.ticketUri = performerElem.getAttribute('href');
        } else {
          log.errorLogs.push(`Not able to find a .artist-info for event in main page`);
        }
        // get door time and age restriction
        let details = eventItem.querySelector(".artist-details");
        if (details) {
          let timeStr = details.querySelector(".detail_event_time > div.name").innerText.trim();
          [event.rawDoorTimeStr, event.doorTimeHours, event.doorTimeMin ] = injectedHelpers.parseTime(timeStr);
          let ageRestrictionElem = details.querySelector(".detail_age > div.name");
          if (ageRestrictionElem) {
            let ageRestrictionText = ageRestrictionElem.innerText.trim();
            if (ageRestrictionText.indexOf("18") >= 0)
              event.minAge = 18;
            else if (ageRestrictionText.indexOf("21") >= 0)
              event.minAge = 21;
            else if (ageRestrictionText.toLowerCase().indexOf("all") >= 0)
              event.minAge = 0;
            else 
              event.minAge = null;
          } else {
            log.warningLogs.push(`No age restriction found for: ${event.eventTitle}`);
          }
        } else {
          log.errorLogs.push(`Not able to find a .artist-details for event in main page`);
        }

        //get image
        let imgElem = eventItem.querySelector("div.list-img a img");
        if (imgElem) {
          event.eventImageUris.push(imgElem.getAttribute('src'));
        } else {
          log.warningLogs.push(`Not able to find a div.thumb a img for event ${event.eventTitle}`);
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

let scrapeDetailPage = async(page: puppeteer.Page, curEvent:models.CaptureEvent, log: models.CaptureLog, deps: any) : Promise<[models.CaptureLog, models.CaptureEvent]> => {
  //browse to the cur event's detail page
  await puppeteerUtils.goto(page, deps.curUri, deps.navSettings);

  //add helpers from parsers module into page
  await puppeteerUtils.injectHelpers(page, [parsers, domUtils], 'injectedHelpers');

  //scrape from container element
  return [log, curEvent ] = 
        await page.$$eval<[models.CaptureLog, models.CaptureEvent], models.CaptureEvent, models.CaptureLog, any>(
          deps.channelCfg.DETAIL_CONTENT_SELECTOR, 
          parseCanalClubDetailPageBrowserFn, 
          curEvent,
          log,
          deps);
}

let parseCanalClubDetailPageBrowserFn = (detailCtx, curEvent: models.CaptureEvent, log: models.CaptureLog, deps : any): [models.CaptureLog, models.CaptureEvent] => {
  try
  {
    curEvent.detailPageHtml = document.body.innerHTML;
    curEvent.detailPageInnerText = document.body.innerText;
    
    if (!detailCtx || detailCtx.length < 1) {
      log.errorLogs.push(`Could not find Detail Container Element for page: ${deps.curUri}`);
    }
    else if (detailCtx.length > 0) {
      let curCtx = detailCtx[0];

      // start date and time
      let dateTime = new Date(curCtx.querySelector('#eventstart').getAttribute('value'));
      curEvent.startDt = dateTime.toISOString();

      // ticket cost for general admission
      let ticketList = curCtx.querySelector('ul.ticket-list');
      for (let ticket of ticketList.querySelectorAll('li')) {

        if (ticket.innerText.toLowerCase().indexOf("general admission") >= 0 ||
         ticket.innerText.toLowerCase().indexOf("ga") >= 0 ||
         ticket.innerText.toLowerCase().indexOf("adv") >= 0 ) {
          let price = ticket.querySelector('.price').innerText.trim().replace(/\$/g, '')
          price = parseFloat(price)
          if (price > 0)
            curEvent.ticketCost.push({amt: price, qualifier: "advance"})
          break;
        }
      }

      // twitter share, facebook share
      curEvent.facebookShareUri = 'https://www.facebook.com/TheCanalClub/';  //venue specific, doesn't seem to be a direct link 
      curEvent.twitterShareUri = 'https://twitter.com/TheCanalClub';  //venue specfic, doesn't seem to be a direct link
    
      // main performer image
      let imageElem = curCtx.querySelector('div.main-image > a > img');
      if (imageElem) {
        curEvent.performers.filter(x => x.isPrimaryPerformer)[0].performerImageUris.push(imageElem.getAttribute('src'));
      } else {
        log.warningLogs.push(`No image found at div.main-image > a > img on page: ${deps.curUri}`);
      }

      // event description
      let details = curCtx.querySelector('div.event-details');
      if (details) {
        curEvent.eventDesc = details.innerText.trim();
      } else {
        log.warningLogs.push(`No event details found at div.event-details on page: ${deps.curUri}`);
      }
      
      // performer links not structured, thus not scraped
    } 
  }
  catch(e)
  {
    log.errorLogs.push(`Capture Detail Page Exception Thrown: ${e.message} at ${deps.curUri}`);
  }

  return [log, curEvent];
};

