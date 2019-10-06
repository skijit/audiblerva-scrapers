export const CAPTURE_KEY : string = 'theNational';
declare const injectedHelpers : any, document : any;

import { puppeteer, puppeteerUtils, apiClient, models, parsers, domUtils, captureHelpers, awsHelpers, screenshots } from '../../barrel';
import { CFG } from '../../config';
import { CapturePerformer, UriType } from '../../core/models';
import { link } from 'fs';

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

        //get main title, performers, and detail page uri
        let titleElem = eventItem.querySelector("div.title");
        if (titleElem) {
          let h5Elems = [...(titleElem.querySelectorAll('h5'))];
          event.promoters.push( ...(h5Elems.map(x => ({ name: x.innerText.trim(), uris: [], desc:''}) )));

          let mainBandElem = (titleElem.querySelector("h3 a")||{});
          event.performers.push({ performerName: mainBandElem.innerText.trim(), isPrimaryPerformer: true, performerUris: [], performerImageUris: []} as CapturePerformer);
          event.eventUris.push({ uri: mainBandElem.getAttribute('href'), isCaptureSrc: true} as UriType);

          let supportingBandElem = titleElem.querySelector('h4');
          if (supportingBandElem) {
            event.performers.push( ...
              (((supportingBandElem.innerText.replace(/^ft\.\s{1}/i,"").replace(/^with\s{1}/i, "").split(","))||[])
              .filter(x => x.trim())
              .map(x => ({ performerName: x.trim(), isPrimaryPerformer: false, performerUris: [], performerImageUris: []} as CapturePerformer)))
            );
          }
          event.eventTitle = titleElem.innerText.trim().replace(/\n/g," ").replace(/\s{2,}/g, " ");

          //set comma between supporting bands if they don't exist
          for(let sBand of event.performers.filter(x => !x.isPrimaryPerformer)) {
            if (!event.eventTitle.toLowerCase().includes(`, ${sBand.performerName.toLowerCase()}`)) {
              let re = new RegExp(`[^,]{1}\s*${sBand.performerName}`,"i");
              event.eventTitle = event.eventTitle.replace(re, `, ${sBand.performerName}`);
            }
          }
        } else {
          log.errorLogs.push(`Not able to find a div.title for event in main page`);
        }

        //get image
        let imgElem = eventItem.querySelector("div.thumb a img");
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
          parseNationalDetailPageBrowserFn, 
          curEvent,
          log,
          deps);
}

let parseNationalDetailPageBrowserFn = (detailCtx, curEvent: models.CaptureEvent, log: models.CaptureLog, deps : any): [models.CaptureLog, models.CaptureEvent] => {
  try
  {
    curEvent.detailPageHtml = document.body.innerHTML;
    curEvent.detailPageInnerText = document.body.innerText;
    
    if (!detailCtx || detailCtx.length < 1) {
      log.errorLogs.push(`Could not find Detail Container Element for page: ${deps.curUri}`);
    }
    else if (detailCtx.length > 0) {
      let curCtx = detailCtx[0];

      //start date and time, and door info
      let baseDate = new Date(curCtx.querySelector('li.date').innerText.replace("DATE\n",""));
      let doorsElem = curCtx.querySelector('span.doors');
      if (!doorsElem) { log.errorLogs.push(`Could not find door info from span.doors on page: ${deps.curUri}`); }
      let doorTime = doorsElem.innerText.replace("DOORS\n","").trim();
      [curEvent.rawDoorTimeStr, curEvent.doorTimeHours, curEvent.doorTimeMin ] = injectedHelpers.parseTime(doorTime);
      let startTimeElem = doorsElem.previousElementSibling;
      if (!startTimeElem) { log.errorLogs.push(`Could not find start time info from previous sibling of span.doors on page: ${deps.curUri}`); }
      let startTime = startTimeElem.innerText.replace("TIME\n","").trim();
      let [rawString, timeHours, timeMin] = injectedHelpers.parseTime(startTime);
      baseDate.setHours(timeHours, timeMin);
      curEvent.startDt = baseDate.toISOString();

      //ticket info including link
      let ticketLinkElem = curCtx.querySelector('#event_detail_header a.btn-tickets');
      if (ticketLinkElem) {
        curEvent.ticketUri = ticketLinkElem.getAttribute('href');
      } else {
        log.warningLogs.push(`No ticket link found at #event_detail_header a.btn-tickets on page: ${deps.curUri}`);
      }
      let ticketPriceElem = curCtx.querySelector('li.ticket-prices');
      if (ticketPriceElem) {
        curEvent.ticketCostRaw = ticketPriceElem.innerText.replace('TICKET PRICES*\n', '').replace('\n'," ").trim();
        curEvent.ticketCost = <models.TicketAmtInfo[]> injectedHelpers.parseTicketString(curEvent.ticketCostRaw);
      } else {
        log.warningLogs.push(`No ticket info found at li.ticket-prices on page: ${deps.curUri}`);
      }

      //age-restriction
      let ageRestrictionElem = curCtx.querySelector('li.age div.age_res');
      if (ageRestrictionElem) {
        let ageRestrictionText = ageRestrictionElem.innerText.trim();
        if (ageRestrictionText.indexOf("18") >= 0)
          curEvent.minAge = 18;
        else if (ageRestrictionText.indexOf("21") >= 0)
          curEvent.minAge = 21;
        else if (ageRestrictionText.toLowerCase().indexOf("all") >= 0)
          curEvent.minAge = 0;
        else 
          curEvent.minAge = null;
      } else {
        log.warningLogs.push(`No age restriction found at li.age on page: ${deps.curUri}`);
      }

      //twitter share, facebook share
      curEvent.facebookShareUri = 'https://www.facebook.com/thenationalva';  //venue specific, doesn't seem to be a direct link 
      curEvent.twitterShareUri = 'http://www.twitter.com/TheNationalRVA';  //venue specfic, doesn't seem to be a direct link
    
      //main performer image
      let imageElem = curCtx.querySelector('div.event_image img');
      if (imageElem) {
        curEvent.performers.filter(x => x.isPrimaryPerformer)[0].performerImageUris.push(imageElem.getAttribute('src'));
      } else {
        log.warningLogs.push(`No image found at div.event_image img on page: ${deps.curUri}`);
      }

      //main performer desc
      let bioElem = curCtx.querySelector('div.bio div.collapse-wrapper');
      if (bioElem) {
        let mainPerformer = curEvent.performers.filter(x => x.isPrimaryPerformer)[0];
        mainPerformer.performerDesc = bioElem.innerText.trim();
      } else {
        log.warningLogs.push(`No artist bio found at div.bio div.collapse-wrapper on page: ${deps.curUri}`);
      }
      
      //performer links (there are lots)
      let mainPerformer = curEvent.performers.filter(x => x.isPrimaryPerformer)[0];
      let linkArray = [...curCtx.querySelectorAll('div.artist-links a')].map(x => x.getAttribute('href'));
      if (linkArray) {
        mainPerformer.performerUris.push(...linkArray);
      }
    } 
  }
  catch(e)
  {
    log.errorLogs.push(`Capture Detail Page Exception Thrown: ${e.message} at ${deps.curUri}`);
  }

  return [log, curEvent];
};

