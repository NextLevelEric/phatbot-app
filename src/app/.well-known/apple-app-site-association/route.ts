import {NextResponse} from "next/server";

export const dynamic = "force-static";

export function GET(){
  return NextResponse.json({
    applinks:{
      apps:[],
      details:[{
        appID:"TEAMID.com.nextleveldigitalmedia.phatbot",
        components:[
          {"/":"/train-together/*","comment":"Open PHATBOT Train Together invitations in the installed app"}
        ]
      }]
    }
  },{
    headers:{
      "Content-Type":"application/json",
      "Cache-Control":"public, max-age=300"
    }
  });
}
