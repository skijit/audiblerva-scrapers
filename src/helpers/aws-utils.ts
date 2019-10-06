import Axios from "axios";
import { apiClient, models } from "./../barrel";
import { AWSError } from "aws-sdk/lib/error";
import requestImageSize = require('request-image-size');
import S3 = require('aws-sdk/clients/s3');

// - S3 / Images backround info:
//     - I want image names to be unique, so I've used their original URI, minus commandline parameters, in their S3 bucket path.
//     - original URI:
//         - domain name: non-case-sensitive
//         - path/file: case-sensitive
//     - S3 URI
//         - domain name: 
//             - use normal URL format (s3.amazonaws.com/BucketName/Path) instead of virtual hosting format (musical.image-depot-1.s3.amazonaws.com) bc the former lets you use https.  [ref](https://docs.aws.amazon.com/AmazonS3/latest/dev/VirtualHosting.html)
//             - The latter lets you use map custom DNS, but that doesn't matter.
//         - original domain name: lowcase
//             - To compensate for the lack of key sensitivity.  We don't want to have to keep the same image twice on s3.
//         - orig path/file: no change
//     - S3 Key
//         - LowercasedOrigDomainName/original path/file





export const persistImagesToAws = async(captureLog: models.CaptureLog, captureResults: models.CaptureResults, bucketName : string) : Promise<[models.CaptureLog, models.CaptureResults]>  => {

  //loop over each event
  for(let i = 0; i < captureResults.events.length; i++) {
    captureResults.events[i].savedEventImageUris = [];

    //eventImageUris
    //TODO: logic is dependent on being able to access image wo query string... should make more robust
    for(let j = 0; captureResults.events[i].eventImageUris && j < captureResults.events[i].eventImageUris.length; j++) {
      try {
        let origUri = noQs(captureResults.events[i].eventImageUris[j]);        
        let s3DataUri = buildS3DataUri(origUri,bucketName); 
        let s3Key = buildS3Key(origUri); 
                                                
        if (captureResults.events[i].savedEventImageUris.map(x => x.src).findIndex(x => x == s3DataUri) === -1) {
          console.log(`evaluating img: ${origUri}, ${s3DataUri}, ${s3Key}`);
          
          await saveImageIfRequired(s3Key, origUri, bucketName);
          let imageSize = await requestImageSize(origUri);

          captureResults.events[i].savedEventImageUris.push({
            src: s3DataUri,            
            key: s3Key,
            height: imageSize.height,
            width: imageSize.width,
            type: imageSize.type
          } as models.SavedImage);
        }                
      } catch (e) {
        captureLog.errorLogs.push(`Error encountered uploading image: ${captureResults.events[i].eventImageUris[j]}, ${e.message}`);
      }
    }

    //each performer
    for(let j = 0; captureResults.events[i].performers && j < captureResults.events[i].performers.length; j++) {
      captureResults.events[i].performers[j].savedPerformerImageUris = [];
      
      //each performerImage
      for(let k = 0; captureResults.events[i].performers[j].performerImageUris && k < captureResults.events[i].performers[j].performerImageUris.length; k++) {
        try {
          let origUri = noQs(captureResults.events[i].performers[j].performerImageUris[k]);          
          let s3DataUri = buildS3DataUri(origUri,bucketName); 
          let s3Key = buildS3Key(origUri); 
          
          if (captureResults.events[i].performers[j].savedPerformerImageUris.map(x => x.src).findIndex(x => x == s3DataUri) === -1) {
            console.log(`evaluating img: ${origUri}, ${s3DataUri}, ${s3Key}`);

            await saveImageIfRequired(s3Key, origUri, bucketName);
            let imageSize = await requestImageSize(origUri);
            
            captureResults.events[i].performers[j].savedPerformerImageUris.push({
              src: s3DataUri,
              key: s3Key,
              height: imageSize.height,
              width: imageSize.width,
              type: imageSize.type
            } as models.SavedImage);
          }
        } catch (e) {
          captureLog.errorLogs.push(`Error encountered uploading image: ${captureResults.events[i].performers[j].performerImageUris[k]}, ${e.message}`);
        }
      }
    }
  }

  return [captureLog, captureResults];
}

const noQs = (fileName : string) : string => fileName.split('?')[0];

const noScheme = (uri:string) : string => uri.replace(/^HTTP[S]*\:\/\//i,"");

const lowerCaseDomainName = (uri:string) => {
  uri = noScheme(uri);
  let segments = uri.split('/');
  let domain = segments.shift().toLowerCase();
  return [ domain, ...segments].join('/');
}

export const buildS3Key = (uri:string) : string => lowerCaseDomainName(noQs(noScheme(uri)));

export const buildS3DataUri = (uri:string, bucketName:string) : string => `s3.amazonaws.com/${bucketName}/${buildS3Key(uri)}`;

const saveImageIfRequired = async(s3Key:string, origUri:string, bucketName)  => {       
  let isKnown : boolean = await apiClient.isKnownImage(s3Key);
  console.log(`image key: ${s3Key} was ${isKnown ? "": "NOT" } found on s3. ${isKnown ? "": "Uploading..." } `);

  if (!isKnown) 
    await saveImageToS3(s3Key, origUri, bucketName); 
}

const saveImageToS3 = async(s3Key:string, origUri:string, bucketName) => {      
  
  let imgResponse = await Axios.get(origUri, 
    {
      responseType: 'arraybuffer', 
      timeout: 30000,
    }
  );
    
  var s3 = new S3();
            
  let params : S3.PutObjectRequest = {
    Bucket: bucketName, 
    Key: s3Key, 
    Body: imgResponse.data,
    ACL: 'public-read'
  };

  await s3.putObject(params, 
    (err : AWSError, data : S3.PutObjectOutput) => {
      if (err)
        throw err;      
    }
  ).promise();
        
}
