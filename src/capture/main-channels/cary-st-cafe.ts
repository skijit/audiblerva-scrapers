declare const injectedHelpers : any; 
declare const document : any;

export const CAPTURE_KEY : string = 'caryStCafe';

import {puppeteer, puppeteerUtils, apiClient, models, parsers, captureHelpers, awsHelpers, screenshots } from '../../barrel';
import { CFG } from '../../config';

let envCfg = CFG[process.env.NODE_ENV || "development"];
let channelCfg = CFG[CAPTURE_KEY];

export async function main() {

  let bundledRuntimeDependencies : any = {
    channelCfg: channelCfg,
    curUri: channelCfg.PRIMARY_URI,
    CONTACT_ITEM_TYPES: models.CONTACT_ITEM_TYPES,
    eventSelector: channelCfg.DAY_EVENT_SELECTOR,
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
    let isLastPage : boolean = false;

    //set up puppeteer and navigate to page
    const [browser, page] = await puppeteerUtils.init({ debug: envCfg.debug, uri: channelCfg.PRIMARY_URI}, channelCfg.NAV_SETTINGS);

    //add helpers from parsers module into page
    await puppeteerUtils.injectHelpers(page, [parsers], 'injectedHelpers');
    
    do {
      //capture from main page - if there's no matching selector, exception is thrown, which will be interpreted as 'last page'
      try {
        [log, results, isLastPage] = await 
          page.$$eval<[models.CaptureLog, models.CaptureResults, boolean], models.CaptureResults, models.CaptureLog, any>(
            channelCfg.DAY_EVENT_SELECTOR, 
            parseMainCscPageBrowserFn,
            results,
            log,
            bundledRuntimeDependencies
        );
      } catch {
        isLastPage = true;
      }
      
      //page forward
      if (!isLastPage) {      
        await page.evaluate(
          (buttonSelector) => {
            var pagerElem = document.querySelector(buttonSelector);
            if (pagerElem) {
              pagerElem.click();
            }
          }, 
          'button[title="Next"]');

        console.log('paging to next...')
      }      
      await page.waitFor(5000);
    } while (!isLastPage)

    //post-processing: remove any events with no dates    
    results.events = results.events.filter(val => val.startDt);
    log.totalCapturedEvents = results.events.length;
    
    if (envCfg.persistImagesToAws)
      [ log, results ] = await awsHelpers.persistImagesToAws(log, results, envCfg.s3BucketName);

    log = await screenshots.doScreenshot(log, page, channelCfg.PRIMARY_URI, envCfg.s3BucketName);
        
  } catch (e) {
    log.errorLogs.push(`Top-Level Capture Page Exception Thrown: ${e.message} at ${channelCfg.PRIMARY_URI}`);
    
  } finally {
    captureHelpers.outputLog(log);    
  }
    
  let testHttp = await apiClient.postCaptureResults(log, results);

  return 0;

}

let parseMainCscPageBrowserFn = (eventContainers, results, log, deps): [models.CaptureLog, models.CaptureResults, boolean] => {
  if (!eventContainers || eventContainers.length == 0) 
    return [log, results, true]; 

  try {
    for (let eventContainerElem of eventContainers||[]) {
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
        detailPageInnerText : document.body.innerText,
        detailPageHtml : document.body.innerHTML,
        neighborhood: deps.neighborhood
      };

      let eventTitleElem = eventContainerElem.querySelector('span.simcal-event-title');
      if (eventTitleElem && eventTitleElem.innerText) {
        let ticketRe = /\w*\$(\d+)\w*$/;
        let freeRe = /\(?free\)?\w*$/gi;
        let matchTicketContents = eventTitleElem.innerText.match(ticketRe);
        let matchFreeContents = eventTitleElem.innerText.match(freeRe);
        if (matchTicketContents && matchTicketContents.length > 1) {
          event.ticketCost = [{amt: parseInt(matchTicketContents[1]), qualifier: ""} as models.TicketAmtInfo];
          event.ticketCostRaw = matchTicketContents[0];
          event.eventTitle = (eventTitleElem.innerText.replace(ticketRe, "")||"").trim();
        } else if (matchFreeContents && matchFreeContents.length > 0) {
          event.ticketCost = [{amt: 0, qualifier: ""} as models.TicketAmtInfo];
          event.eventTitle = (eventTitleElem.innerText.replace(freeRe, "")||"").trim();
        } else {
          event.eventTitle = eventTitleElem.innerText;
        }                
      } else {
        log.errorLogs.push(`Could not find Event Title from span.simcal-event-title on page: ${deps.curUri}`);
      }

      let startTimeElem = eventContainerElem.querySelector('span.simcal-event-start-date');
      if (startTimeElem && startTimeElem.getAttribute('content')) {
        event.startDt = (new Date(startTimeElem.getAttribute('content'))).toISOString();
      } else {
        log.errorLogs.push(`Could not find Start Date from span.simcal-event-start-date on page: ${deps.curUri}`);
      }

      let endTimeElem = eventContainerElem.querySelector('span.simcal-event-end-date, span.simcal-event-end-time');
      if (endTimeElem && endTimeElem.getAttribute('content')) {
        event.endDt = (new Date(endTimeElem.getAttribute('content'))).toISOString();
      } else {
        log.warningLogs.push(`Could not find End Date from span.simcal-event-end-date, span.simcal-event-end-time on page: ${deps.curUri}`);
      }
      
      results.events.push(event);
    }
  } catch(e) {
    log.errorLogs.push(`Cary St Cafe Main Page Exception Thrown: ${e.message}`);
    console.log("error: " + e)
  }

  return [log, results, false];
};



