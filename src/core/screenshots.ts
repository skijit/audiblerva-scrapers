import {puppeteer, puppeteerUtils, apiClient, models, awsHelpers } from '../barrel';
import { AWSError } from "aws-sdk/lib/error";
import S3 = require('aws-sdk/clients/s3');

//TODO: Add Screenshot to Log
//what is file location / stream? what about the dimensions and type?
//assign key a fixed value based on name of website.
//assign url based on key
//upload without requiring a chec

export const doScreenshot = async(captureLog: models.CaptureLog, page: puppeteer.Page, uri: string, bucketName:string) : Promise<models.CaptureLog> => {    
    
  let vp : puppeteer.Viewport = page.viewport();
  
  let s3Key = `${awsHelpers.buildS3Key(uri).replace(/\/*$/g,"")}/screenshot.png`;
  let s3Src = `${awsHelpers.buildS3DataUri(uri, bucketName).replace(/\/*$/g,"")}/screenshot.png`;

  console.log(`evaluating screenshot: ${s3Src}, ${s3Key}`);

  captureLog.mostRecentScreenShot = {
    src: s3Src,
    key: s3Key,
    height: vp.height,
    width: vp.width,
    type: 'png'
  } as models.SavedImage;

  try {
        
    //https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagescreenshotoptions
    //keeping default options for screenshot
    let bits: Buffer = await page.screenshot({encoding: 'binary'});

    var s3 = new S3();
                  
    let params : S3.PutObjectRequest = {
      Bucket: bucketName, 
      Key: s3Key, 
      Body: bits,
      ACL: 'public-read'
    };

    await s3.putObject(params, 
      (err : AWSError, data : S3.PutObjectOutput) => {        
        if (err)
          throw err;   
      }
    ).promise();  

    console.log(`Successfully uploaded screenshot at: ${s3Src}`)

  } catch (e) {
    captureLog.errorLogs.push(`Error taking screenshot: ${e.message} at ${uri}.`);
  } finally {
    return captureLog;
  }
  
};