import { initParms } from './puppeteer-utils';
import * as puppeteer from 'puppeteer';

declare const window : any, jQuery : any;

export interface initParms {
  debug: boolean,
  uri: string,
  width?: number,
  height?: number,
  boostMem?: boolean
}

export const init = async(parms : initParms, navOpts): Promise<[puppeteer.Browser, puppeteer.Page]> => {
  console.log('navigating to: ' + parms.uri);
  
  const browser = await (parms.debug ? 
    puppeteer.launch({
      headless: false,
      devtools: true,
      slowMo: 250, // slow down by 250ms,
      args: parms.boostMem ? ['--disable-dev-shm-usage']: [],
    }) :  
    puppeteer.launch({
      args: parms.boostMem ? ['--disable-dev-shm-usage']: []
    }));
  
  const page = await browser.newPage();
  
  page.setViewport({ height: parms.height||600, width: parms.width||800});
  await goto(page, parms.uri, navOpts).catch(e => console.log(`Error Goto Exception Caught: ${e.message}`));
  await page.waitFor(5 * 1000);

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('error', err => console.log('PAGE LOG:', err.message));    
  page.on('pageerror', err => console.log('PAGE LOG:', err.message)); 
    
  return [browser, page];
}

export const goto = async(page : puppeteer.Page, uri:string, navOpts) : Promise<puppeteer.Page> => {
  await page.goto(uri, navOpts).catch(e => console.log(`Error Goto Exception Caught: ${e.message}`));
  await page.waitFor(2 * 1000);
  return page;
}

export const injectHelpers = async(page: puppeteer.Page, modules: any[], containerObjName: string) => {
  
  let injectable : string = `var ${containerObjName} = ${containerObjName}||{ };`;
  for (let curModule of modules) {
    for(let k of Object.keys(curModule)) {
      injectable += `${containerObjName}['${k}']=${curModule[k].toString()};`;
    }  
  }
  
  await page.addScriptTag({content: injectable});
};

export const injectJquery = async(page: puppeteer.Page, wrappername:string) => {

  //inject local jquery
  await page.addScriptTag({path: require.resolve('jquery')});

  //rename local jquery
  await page.evaluate((wn) => {
    window[wn] = jQuery.noConflict(true);
  }, wrappername);
}