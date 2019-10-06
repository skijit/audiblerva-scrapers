import Axios, { AxiosPromise, AxiosResponse } from "axios";
import * as models from "./models";

const port=process.env.MUSICAL_LOCAL_WEB_API_PORT || "5000";
const baseUrl : string = `http://localhost:${port}`;

export const postCaptureResults = async(captureLog: models.CaptureLog, captureResults: models.CaptureResults) => {    
    const postUrl : string = '/api/v1/capture/';
    
    try {  
      // Send a POST request
      let response1 : AxiosResponse<models.CaptureDto> = await Axios({
        method: 'post',
        url: baseUrl+postUrl,
        maxContentLength: 2000 * 1000 * 1000,
        data: <models.CaptureDto> {
          captureResults: <models.CaptureResults> captureResults,
          captureLog: <models.CaptureLog> captureLog
        }
      });

      console.log('POST RESPONSE FROM HTTP CLIENT... (xpecting 202');
      console.log(response1.status);
      //console.log(response1.headers);
      console.log(response1.data); //payload<t>
    } catch(e) {
      console.log('ERROR FROM HTTP CLIENT...');
      console.log(e);
    }
  
    return 0;
  
  }

export const isKnownImage = async(imageKey:string) : Promise<boolean> => {
  const getUrl : string = `/api/v1/isKnownImage?imageKey=${encodeURIComponent(imageKey)}`;
  let rv : boolean = false;
  
  try {  
    // Send a Get request
    let imgQueryResp = await Axios.get(baseUrl+getUrl)
    rv = imgQueryResp.data;        
  } catch(e) {
    console.log('ERROR FROM Image Query...');
    console.log(e);
  }

  return rv;
}
  
