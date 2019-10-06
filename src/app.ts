import * as camel from "./capture/main-channels/camel";
import * as sm from "./capture/main-channels/strange-matter";
import * as bb from "./capture/main-channels/broadberry";
import * as nat from "./capture/main-channels/the-national";
import * as tp from "./capture/main-channels/tin-pan";
import * as csc from "./capture/main-channels/cary-st-cafe";
import * as rs from "./capture/main-channels/richmond-symphony";
import * as rvas from "./capture/main-channels/richmond-shows";
import * as eb from "./capture/main-channels/event-brite";

(async () => {
    let runAll : boolean = process.argv.length <= 2;
    let evalRun = (captureJobName) : boolean => runAll || process.argv.indexOf(captureJobName) > 1;
    
    if (evalRun(camel.CAPTURE_KEY)) {
        await camel.main()
        console.log('i finished camel');
    }

    // if (evalRun(sm.CAPTURE_KEY)) {
    //     await sm.main()
    //     console.log('i finished strange matter');
    // } 

    if (evalRun(bb.CAPTURE_KEY)) {
      await bb.main()
      console.log('i finished broadberry');
    } 

    if (evalRun(nat.CAPTURE_KEY)) {
      await nat.main()
      console.log('i finished the national');
    } 

    if (evalRun(tp.CAPTURE_KEY)) {
      await tp.main()
      console.log('i finished the tin-pan');
    } 

    if (evalRun(csc.CAPTURE_KEY)) {
      await csc.main()
      console.log('i finished cary st cafe');
    } 

    if (evalRun(rs.CAPTURE_KEY)) {
      await rs.main()
      console.log('i finished richmond symphony');
    } 

    if (evalRun(rvas.CAPTURE_KEY)) {
      await rvas.main()
      console.log('i finished rva shows');
    } 

    if (evalRun(eb.CAPTURE_KEY)) {
      await eb.main()
      console.log('i finished event brite');
    } 
    
    process.exit(0);
})();

