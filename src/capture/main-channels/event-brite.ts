declare const injectedHelpers : any; 
declare const document : any;

export const CAPTURE_KEY : string = 'eventBrite';

import {puppeteer, puppeteerUtils, apiClient, models, parsers, domUtils, captureHelpers, awsHelpers, screenshots } from '../../barrel';
import { CFG } from '../../config';

let envCfg = CFG[process.env.NODE_ENV || "development"];
let channelCfg = CFG[CAPTURE_KEY];

export async function main() {

  let bundledRuntimeDependencies : any = {
    channelCfg: channelCfg,
    curUri: channelCfg.PRIMARY_URI,
    CONTACT_ITEM_TYPES: models.CONTACT_ITEM_TYPES,
    eventSelector: channelCfg.DAY_EVENT_SELECTOR,
    navSettings: channelCfg.NAV_SETTINGS
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
    let browser: puppeteer.Browser, page: puppeteer.Page;

    //eventbrite sorting sucks.  just take the first 10 pages already.    
    for(let p = 1; p <= channelCfg.TOTAL_PAGES; p++) {    
      bundledRuntimeDependencies.curUri = channelCfg.PRIMARY_URI+p;

      //set up puppeteer and navigate to page
      [browser, page] = await puppeteerUtils.init({ 
          debug: envCfg.debug, 
          uri: bundledRuntimeDependencies.curUri, 
          boostMem: true
        }, 
        channelCfg.NAV_SETTINGS);

      //add helpers from parsers module into page
      await puppeteerUtils.injectHelpers(page, [parsers], 'injectedHelpers');
      
      //capture from main page
      [log, results] = await 
        page.$$eval<[models.CaptureLog, models.CaptureResults], models.CaptureResults, models.CaptureLog, any>(
          channelCfg.EVENT_CONTAINER_SELECTOR, 
          parseMainEventBritePageBrowserFn,
          results,
          log,
          bundledRuntimeDependencies
      ); //day eval
    }

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
        [log, curEvent] = await captureHelpers.parseEventbrite(page, curEvent, log, bundledRuntimeDependencies);

        //flag any events missing images
        if (!curEvent.eventImageUris || curEvent.eventImageUris.length == 0)
          log.warningLogs.push(`Event: ${curEvent.eventTitle} at uri: ${curEvent.eventUris.filter(x => x.isCaptureSrc).map(x => x.uri)[0]} is missing any captured images.`);

        results.events[i] = curEvent;
                
      } //if event has detail page
    } //for each event
    
    //post-processing: remove any events with no dates
    results.events = results.events.filter(val => val.startDt);
    log.totalCapturedEvents = results.events.length;

    if (envCfg.persistImagesToAws)
      [ log, results ] = await awsHelpers.persistImagesToAws(log, results, envCfg.s3BucketName);
    
  } catch (e) {
    log.errorLogs.push(`Top-Level Capture Page Exception Thrown: ${e.message} at ${bundledRuntimeDependencies.curUri}`);
  } finally {
    captureHelpers.outputLog(log); 
  }
      
  let testHttp = await apiClient.postCaptureResults(log, results);

  return 0;
}

const parseMainEventBritePageBrowserFn = (daysCtx, results, log, deps): [models.CaptureLog, models.CaptureResults] => {    
  //get each day w >= 1 event
  console.log(`parse eb: ${!!daysCtx} and ${daysCtx.length}`);

  for (let dayItem of daysCtx||[]) {      
    //get each event
    console.log(`parse eb: about to select: ${deps.channelCfg.DAY_EVENT_SELECTOR}`);
    let eventsCtx = dayItem.querySelectorAll(deps.channelCfg.DAY_EVENT_SELECTOR);
    console.log(`parse eb: ${!!eventsCtx} and ${eventsCtx.length}`);
    for (let eventItem of eventsCtx||[]) {
      console.log('parse eb: inside capture page');
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
        venueAddressLines: [],
        venueContactInfo: [],
        eventContactInfo: [] as models.ContactInfoItem[],
        minAge: null,
        rawDoorTimeStr: null,
        doorTimeHours: null,
        doorTimeMin: null,
        promoters: [] as models.PromoterInfo[]        
      };

      console.log('parse eb: initialized event');

      try {

        let workingTitle = eventItem.querySelector('div[data-spec="event-card__formatted-name--content"]').innerText;

        //break summary into lines.  find the date.  line before that is title, line after that is venue name.
        let textArray = eventItem.innerText.split('\n');
        let dateIdx = -1;
        for(let dayCtr = 0; dayCtr < textArray.length; dayCtr++) {
          if (textArray[dayCtr].match(/^(Sun|Sat|Fri|Mon|Tue|Wed|Thu),/i)) {
            dateIdx = dayCtr;
            break;
          }
        }
        if (dateIdx == -1) {
          log.infoLogs.push(`Not able to find date-based parse-pivot for event ${workingTitle} on page ${deps.curUri}`);
          continue;
        }
        event.venueName = textArray[dateIdx + 1].split(',')[0];
        event.eventTitle = textArray[dateIdx -1];
        
        //get uri
        let detailLink = eventItem.querySelector('a.eds-event-card-content__action-link');
        if (detailLink) {
          // details moved to new page
          event.eventUris.push({ uri: detailLink.getAttribute('href'), isCaptureSrc: true } as models.UriType);
          event.ticketUri =  detailLink.getAttribute('href');
        } else {
          log.errorLogs.push(`Could not find link for ${workingTitle} using a.eds-event-card-content__action-link on page ${deps.curUri}`);
          continue;
        }

        results.events.push(event);

      } catch(e) {
        log.errorLogs.push(`Capture Main Page Exception Thrown: ${e.message}`);
      }        
    } //event loop
  } //day loop
  
  return [log, results];
}
